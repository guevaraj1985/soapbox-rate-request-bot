import type { App } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import type { RateRequestRepository } from "../db/rateRequestRepository.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import {
  ACTION_ASSIGN,
  ACTION_CANCEL,
  ACTION_COMPLETE,
  ACTION_IN_PROGRESS,
  ACTION_NEEDS_INFO,
  ACTION_REOPEN,
  ACTION_REQUEST_TYPE,
  ACTION_SEND_TEMPLATE,
  ASSIGN_VIEW,
  CANCEL_VIEW,
  COMPLETE_VIEW,
  NEEDS_INFO_VIEW,
  RATE_REQUEST_COMMAND,
  RATE_REQUEST_VIEW
} from "../slack/constants.js";
import { buildAssignModal, buildCancelConfirmationModal, buildCompletionModal, buildNeedsInfoModal, buildRateRequestModal } from "../slack/viewBuilders.js";
import { getAssignValues, getCompletionValues, getNeedsInfoValues, getRateRequestValues, validateRateRequestValues } from "../slack/payload.js";
import { getSlackUserProfile } from "../services/slackUserService.js";
import { RequestWorkflow } from "../services/requestWorkflow.js";
import { sendTemplateFileToRequester } from "../services/templateFileService.js";

export function registerRateRequestHandlers(app: App, repo: RateRequestRepository) {
  app.command(RATE_REQUEST_COMMAND, async ({ ack, body, client, respond }) => {
    await ack();
    try {
      const requester = await getSlackUserProfile(client, body.user_id);
      await client.views.open({
        trigger_id: body.trigger_id,
        view: buildRateRequestModal({
          requesterName: requester.name,
          requesterEmail: requester.email,
          templateUrl: config.RATE_REQUEST_TEMPLATE_URL,
          templateFileEnabled: Boolean(config.RATE_REQUEST_TEMPLATE_FILE_PATH)
        })
      });
      logger.info({ userId: body.user_id }, "Opened rate request modal");

    } catch (error) {
      logger.error({ error, userId: body.user_id }, "Failed to open rate request modal");
      await respond({
        response_type: "ephemeral",
        text: "Sorry, I could not open the rate request form. Please confirm the bot can read your Slack profile and email."
      });
    }
  });


  app.action(ACTION_REQUEST_TYPE, async ({ ack, body, client }) => {
    await ack();
    if (!isRequestTypeActionBody(body)) return;
    const selectedRequestType = body.actions[0]?.selected_option?.value === "B3PL" ? "B3PL" : "Soapbox";
    await client.views.update({
      view_id: body.view.id,
      hash: body.view.hash,
      view: buildRateRequestModal({
        requesterName: body.user.name ?? "Requester",
        requesterEmail: "Slack profile email will be used on submit",
        templateUrl: config.RATE_REQUEST_TEMPLATE_URL,
        templateFileEnabled: Boolean(config.RATE_REQUEST_TEMPLATE_FILE_PATH),
        selectedRequestType
      })
    });
  });
  app.action(ACTION_SEND_TEMPLATE, async ({ ack, body, client }) => {
    await ack();
    if (!config.RATE_REQUEST_TEMPLATE_FILE_PATH || !isActionBody(body)) return;

    try {
      await sendTemplateFileToRequester(client, body.user.id, config.RATE_REQUEST_TEMPLATE_FILE_PATH);
      logger.info({ userId: body.user.id }, "Sent template file to requester on demand");
    } catch (error) {
      logger.error({ error, userId: body.user.id }, "Failed to send template file on demand");
    }
  });
  app.view(RATE_REQUEST_VIEW, async ({ ack, body, view, client }) => {
    const state = view.state.values as unknown as Record<string, Record<string, Record<string, unknown>>>;
    const values = getRateRequestValues(state);
    const errors = validateRateRequestValues(values);
    if (Object.keys(errors).length > 0) {
      await ack({ response_action: "errors", errors });
      return;
    }

    await ack();
    try {
      const requester = await getSlackUserProfile(client, body.user.id);
      const request = repo.create({
        requesterSlackId: requester.id,
        requesterName: requester.name,
        requesterEmail: requester.email,
        requestType: values.requestType,
        carriers: values.carriers,
        soapboxOption: values.soapboxOption,
        serviceModel: values.serviceModel,
        sbTier: values.sbTier,
        b3plTier: values.b3plTier,
        brandName: values.brandName,
        leadFirstName: values.leadFirstName,
        leadLastName: values.leadLastName,
        leadEmail: values.leadEmail,
        leadPhone: values.leadPhone,
        leadWebsite: values.leadWebsite,
        description: values.description,
        priority: values.priority,
        files: values.files
      });
      await workflow(repo, client).publishNewRequest(request);
      logger.info({ requestNumber: request.requestNumber }, "Created rate request");
    } catch (error) {
      logger.error({ error, userId: body.user.id }, "Failed to create rate request");
    }
  });

  app.action(ACTION_ASSIGN, async ({ ack, body, client }) => {
    await ack();
    await withRequestFromAction(repo, body, async (request) => {
      if (!("trigger_id" in body) || !body.trigger_id) return;
      await client.views.open({ trigger_id: body.trigger_id, view: buildAssignModal(request) });
    });
  });

  app.view(ASSIGN_VIEW, async ({ ack, body, view, client }) => {
    const values = getAssignValues(view.state.values as unknown as Record<string, Record<string, Record<string, unknown>>>);
    if (!values.userId) {
      await ack({ response_action: "errors", errors: { assign_user: "Please select a Slack user." } });
      return;
    }
    await ack();
    const request = repo.findById(Number(view.private_metadata));
    if (!request || request.status === "Complete") return;
    const assignee = await getSlackUserProfile(client, values.userId);
    const updated = repo.assign(request.id, assignee.id, assignee.name);
    const actorLabel = body.user.id === assignee.id ? assignee.name : `<@${body.user.id}>`;
    await workflow(repo, client).refreshParentMessage(updated);
    await workflow(repo, client).postThreadUpdate(
      updated,
      `<@${updated.requesterSlackId}> ${actorLabel} assigned ${updated.requestNumber} to <@${assignee.id}>.`
    );
  });
  app.action(ACTION_IN_PROGRESS, async ({ ack, body, client }) => {
    await ack();
    await withRequestFromAction(repo, body, async (request, _requestId, actorId) => {
      const actor = await getSlackUserProfile(client, actorId);
      const updated = await workflow(repo, client).updateStatus(request, "In Progress", actor);
      await workflow(repo, client).postThreadUpdate(updated, `<@${updated.requesterSlackId}> ${actor.name} marked ${updated.requestNumber} In Progress.`);
    });
  });

  app.action(ACTION_NEEDS_INFO, async ({ ack, body, client }) => {
    await ack();
    await withRequestFromAction(repo, body, async (request, _requestId) => {
      if (!("trigger_id" in body) || !body.trigger_id) return;
      await client.views.open({ trigger_id: body.trigger_id, view: buildNeedsInfoModal(request) });
    });
  });

  app.action(ACTION_COMPLETE, async ({ ack, body, client }) => {
    await ack();
    await withRequestFromAction(repo, body, async (request) => {
      if (!("trigger_id" in body) || !body.trigger_id) return;
      await client.views.open({ trigger_id: body.trigger_id, view: buildCompletionModal(request) });
    });
  });

  app.action(ACTION_REOPEN, async ({ ack, body, client }) => {
    await ack();
    await withRequestFromAction(repo, body, async (request, _requestId, actorId) => {
      if (request.status !== "Complete") return;
      const actor = await getSlackUserProfile(client, actorId);
      const updated = await workflow(repo, client).updateStatus(request, "In Progress", actor, "Reopened after completion");
      await workflow(repo, client).postThreadUpdate(updated, `<@${updated.requesterSlackId}> ${actor.name} reopened ${updated.requestNumber} for more work.`);
    });
  });

  app.action(ACTION_CANCEL, async ({ ack, body, client }) => {
    await ack();
    await withRequestFromAction(repo, body, async (request) => {
      if (!("trigger_id" in body) || !body.trigger_id) return;
      await client.views.open({ trigger_id: body.trigger_id, view: buildCancelConfirmationModal(request) });
    });
  });

  app.view(NEEDS_INFO_VIEW, async ({ ack, body, view, client }) => {
    const values = getNeedsInfoValues(view.state.values as unknown as Record<string, Record<string, Record<string, unknown>>>);
    if (!values.note.trim()) {
      await ack({ response_action: "errors", errors: { needs_info_note: "Please explain what information is needed." } });
      return;
    }
    await ack();
    const request = repo.findById(Number(view.private_metadata));
    if (!request) return;
    const actor = await getSlackUserProfile(client, body.user.id);
    const updated = await workflow(repo, client).updateStatus(request, "Needs Information", actor, values.note);
    await workflow(repo, client).postThreadUpdate(updated, `<@${updated.requesterSlackId}> *${actor.name} requested more information.*\n${values.note}`);
    await workflow(repo, client).notifyRequester(
      updated,
      `Your rate request ${updated.requestNumber} needs more information:\n\n${values.note}`
    );
  });

  app.view(COMPLETE_VIEW, async ({ ack, body, view, client }) => {
    const values = getCompletionValues(view.state.values as unknown as Record<string, Record<string, Record<string, unknown>>>);
    if (!values.summary.trim()) {
      await ack({ response_action: "errors", errors: { completion_summary: "Completion summary is required." } });
      return;
    }
    await ack();
    const request = repo.findById(Number(view.private_metadata));
    if (!request) return;
    const actor = await getSlackUserProfile(client, body.user.id);
    await workflow(repo, client).completeRequest({
      request,
      actor: { id: actor.id, name: actor.name },
      summary: values.summary,
      files: values.files
    });
  });

  app.view(CANCEL_VIEW, async ({ ack, body, view, client }) => {
    await ack();
    const request = repo.findById(Number(view.private_metadata));
    if (!request) return;
    const actor = await getSlackUserProfile(client, body.user.id);
    const updated = await workflow(repo, client).updateStatus(request, "Cancelled", actor);
    await workflow(repo, client).postThreadUpdate(updated, `<@${updated.requesterSlackId}> ${actor.name} cancelled ${updated.requestNumber}.`);
  });
}

function workflow(repo: RateRequestRepository, client: WebClient) {
  return new RequestWorkflow(repo, client, config.RATE_REQUEST_CHANNEL_ID);
}

async function withRequestFromAction(
  repo: RateRequestRepository,
  body: unknown,
  handler: (request: NonNullable<ReturnType<RateRequestRepository["findById"]>>, requestId: number, actorId: string) => Promise<void>
) {
  if (!isActionBody(body)) return;
  const action = body.actions?.[0];
  const requestId = Number(action?.value);
  if (!Number.isInteger(requestId)) return;
  const request = repo.findById(requestId);
  if (!request) return;
  try {
    await handler(request, requestId, body.user.id);
  } catch (error) {
    logger.error({ error, requestId }, "Action handler failed");
  }
}

function isActionBody(body: unknown): body is {
  user: { id: string };
  actions: Array<{ value?: string }>;
  trigger_id?: string;
} {
  return typeof body === "object" && body !== null && "user" in body && "actions" in body;
}







function isRequestTypeActionBody(body: unknown): body is {
  user: { id: string; name?: string };
  view: { id: string; hash?: string; private_metadata?: string };
  actions: Array<{ selected_option?: { value?: string } }>;
} {
  return typeof body === "object" && body !== null && "user" in body && "view" in body && "actions" in body;
}

function parseRateRequestModalMetadata(value?: string) {
  if (!value) return { requesterName: "Requester", requesterEmail: "Slack profile email will be used on submit" };
  try {
    const parsed = JSON.parse(value) as { requesterName?: unknown; requesterEmail?: unknown };
    return {
      requesterName: typeof parsed.requesterName === "string" ? parsed.requesterName : "Requester",
      requesterEmail: typeof parsed.requesterEmail === "string" ? parsed.requesterEmail : "Slack profile email will be used on submit"
    };
  } catch {
    return { requesterName: "Requester", requesterEmail: "Slack profile email will be used on submit" };
  }
}
