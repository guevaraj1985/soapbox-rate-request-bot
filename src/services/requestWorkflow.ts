import type { WebClient } from "@slack/web-api";
import type { RateRequestRepository } from "../db/rateRequestRepository.js";
import type { RateRequest, RequestStatus, SlackFile } from "../types.js";
import { buildRequestMessageBlocks, buildRequesterConfirmationBlocks, formatFiles } from "../slack/messageBuilders.js";
import { openDirectMessage } from "./slackUserService.js";
import { config } from "../config.js";
import {
  attachSalesforceFiles,
  buildSalesforcePayload,
  createSalesforceCompletionNote,
  createSalesforceRecord,
  isSalesforceConfigured
} from "./salesforceService.js";
import { logger } from "../utils/logger.js";

export class RequestWorkflow {
  constructor(
    private readonly repo: RateRequestRepository,
    private readonly client: WebClient,
    private readonly channelId: string
  ) {}

  async publishNewRequest(request: RateRequest): Promise<RateRequest> {
    const post = await this.client.chat.postMessage({
      channel: this.channelId,
      text: `Rate request ${request.requestNumber}: ${request.brandName}`,
      blocks: buildRequestMessageBlocks({ ...request, channelId: this.channelId })
    });

    if (!post.ts) throw new Error("Slack did not return a message timestamp");
    const updated = this.repo.setMessageLocation(request.id, this.channelId, post.ts);

    await this.client.chat.postMessage({
      channel: this.channelId,
      thread_ts: post.ts,
      text: `<@${updated.requesterSlackId}> Rate request ${updated.requestNumber} has been created. Use this thread for questions, updates, analysis, and final files.`
    });

    const approvalNotice = tierApprovalNotice(updated);
    if (approvalNotice) {
      await this.client.chat.postMessage({
        channel: this.channelId,
        thread_ts: post.ts,
        text: approvalNotice
      });
    }

    const withSalesforce = await this.createSalesforceRecordIfEnabled(updated);
    const permalink = await this.getPermalink(withSalesforce);
    await this.sendRequesterConfirmation(withSalesforce, permalink);
    return withSalesforce;
  }

  private async createSalesforceRecordIfEnabled(request: RateRequest): Promise<RateRequest> {
    if (!isSalesforceConfigured()) return request;

    try {
      if (config.SALESFORCE_DRY_RUN) {
        const { objectType, payload } = buildSalesforcePayload(request);
        await this.postThreadUpdate(
          request,
          `Salesforce dry run for ${objectType}. No record was created. Payload:\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``
        );
        return request;
      }

      const salesforce = await createSalesforceRecord(request);
      const updated = this.repo.setSalesforceRecord(request.id, salesforce.objectType, salesforce.id);
      await this.refreshParentMessage(updated);
      const verb = salesforce.created ? "created" : `already exists (${salesforce.duplicateReason ?? "duplicate match"})`;
      await this.postThreadUpdate(updated, `Salesforce ${salesforce.objectType} ${verb}: <${salesforce.url}|${salesforce.id}>`);
      const fileResults = await attachSalesforceFiles(updated, salesforce.id, this.client);
      if (fileResults.length > 0) {
        await this.postThreadUpdate(updated, salesforceFileSyncSummary(fileResults));
      }
      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.postThreadUpdate(request, `Salesforce record creation failed: ${message}`);
      return request;
    }
  }

  async refreshParentMessage(request: RateRequest) {
    if (!request.channelId || !request.messageTs) return;
    await this.client.chat.update({
      channel: request.channelId,
      ts: request.messageTs,
      text: `Rate request ${request.requestNumber}: ${request.status}`,
      blocks: buildRequestMessageBlocks(request)
    });
  }

  async postThreadUpdate(request: RateRequest, text: string) {
    if (!request.channelId || !request.messageTs) return;
    await this.client.chat.postMessage({
      channel: request.channelId,
      thread_ts: request.messageTs,
      text
    });
  }

  async updateStatus(request: RateRequest, newStatus: RequestStatus, actor: { id: string; name: string }, notes?: string) {
    const updated = this.repo.updateStatus(request.id, newStatus, actor.id, actor.name, notes);
    await this.refreshParentMessage(updated);
    return updated;
  }

  async sendRequesterConfirmation(request: RateRequest, messageLink: string) {
    const dm = await openDirectMessage(this.client, request.requesterSlackId);
    await this.client.chat.postMessage({
      channel: dm,
      text: `Rate request ${request.requestNumber} received.`,
      blocks: buildRequesterConfirmationBlocks({ request, messageLink })
    });
  }

  async notifyRequester(request: RateRequest, text: string) {
    const dm = await openDirectMessage(this.client, request.requesterSlackId);
    await this.client.chat.postMessage({ channel: dm, text });
  }

  async completeRequest(input: {
    request: RateRequest;
    actor: { id: string; name: string };
    summary: string;
    files: SlackFile[];
  }) {
    if (input.files.length > 0) {
      this.repo.addCompletionFiles(input.request.id, input.files);
    }
    const updated = await this.updateStatus(input.request, "Complete", input.actor, input.summary);
    const fileText = input.files.length ? `\n\n*Result files*\n${formatFiles(input.files)}` : "";
    await this.postThreadUpdate(updated, `<@${updated.requesterSlackId}> *${input.actor.name} marked this request complete.*\n${input.summary}${fileText}`);
    await this.syncSalesforceCompletion(updated, input.summary, input.actor, input.files);
    await this.notifyRequester(updated, `Your rate request ${updated.requestNumber} is complete.\n\n${input.summary}`);
    return updated;
  }

  private async syncSalesforceCompletion(
    request: RateRequest,
    summary: string,
    actor: { id: string; name: string },
    files: SlackFile[]
  ) {
    if (!isSalesforceConfigured() || !request.salesforceRecordId) return;

    if (config.SALESFORCE_DRY_RUN) {
      await this.postThreadUpdate(
        request,
        `Salesforce completion dry run. Note was not created and ${files.length} final file(s) were not uploaded.`
      );
      return;
    }

    try {
      const slackThreadUrl = await this.getPermalink(request);
      const conversationRecap = await this.buildConversationRecap(request);
      const note = await createSalesforceCompletionNote({
        request,
        salesforceRecordId: request.salesforceRecordId,
        summary,
        actor,
        files,
        slackThreadUrl,
        conversationRecap
      });
      await this.postThreadUpdate(request, `Salesforce Note created for completion notes: ${note.noteId}`);

      const fileResults = await attachSalesforceFiles(request, request.salesforceRecordId, this.client, files);
      if (fileResults.length > 0) {
        await this.postThreadUpdate(request, salesforceFileSyncSummary(fileResults, "Salesforce final file sync"));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.postThreadUpdate(request, `Salesforce completion sync failed: ${message}`);
    }
  }


  private async buildConversationRecap(request: RateRequest): Promise<string | undefined> {
    if (!request.channelId || !request.messageTs) return undefined;

    try {
      const response = await this.client.conversations.replies({
        channel: request.channelId,
        ts: request.messageTs,
        limit: 50
      });
      const messages = response.messages ?? [];
      const lines = messages
        .map((message) => cleanSlackMessageText(typeof message.text === "string" ? message.text : ""))
        .filter((text) => text && !text.startsWith("Salesforce "))
        .slice(-8);

      if (lines.length === 0) return undefined;
      return lines.map((line) => `- ${line}`).join("\n");
    } catch (error) {
      logger.warn({ error, requestNumber: request.requestNumber }, "Could not build Slack thread recap for Salesforce note");
      return undefined;
    }
  }
  async getPermalink(request: RateRequest): Promise<string> {
    if (!request.channelId || !request.messageTs) return "";
    const response = await this.client.chat.getPermalink({
      channel: request.channelId,
      message_ts: request.messageTs
    });
    return response.permalink ?? "";
  }
}

function tierApprovalNotice(request: RateRequest) {
  if (request.requestType !== "Soapbox" || !request.sbTier) return "";
  if (!["3PL Partner (T0)", "Marketplace (T1)", "Reseller (T2)"].includes(request.sbTier)) return "";
  return `<@U0693PQ6H89> <@UK2F5L0HH> <@U068N11K7SM> Approval needed for ${request.requestNumber}: ${request.sbTier} selected for ${request.brandName}.`;
}
function salesforceFileSyncSummary(
  fileResults: Array<{ fileName: string; success: boolean }>,
  label = "Salesforce file sync"
) {
  const attached = fileResults.filter((file) => file.success);
  const failed = fileResults.filter((file) => !file.success);
  const parts = [`${label}: ${attached.length}/${fileResults.length} attached.`];
  if (failed.length > 0) parts.push(`Failed: ${failed.map((file) => file.fileName).join(", ")}`);
  return parts.join(" ");
}

function cleanSlackMessageText(text: string) {
  return text
    .replace(/<@([A-Z0-9]+)>/g, "@$1")
    .replace(/<([^|>]+)\|([^>]+)>/g, "$2 ($1)")
    .replace(/<([^>]+)>/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

