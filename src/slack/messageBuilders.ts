import type { KnownBlock } from "@slack/types";
import type { RateRequest, SlackFile } from "../types.js";
import { b3plTierSummary, sbTierSummary } from "./formOptions.js";
import {
  ACTION_ASSIGN,
  ACTION_CANCEL,
  ACTION_COMPLETE,
  ACTION_IN_PROGRESS,
  ACTION_NEEDS_INFO,
  ACTION_REOPEN
} from "./constants.js";

export function buildRequestMessageBlocks(request: RateRequest): KnownBlock[] {
  const assigned = request.assignedName ? request.assignedName : "Unassigned";
  const actionElements = request.status === "Complete"
    ? [button("Reopen Request", ACTION_REOPEN, request.id)]
    : [
        button("Reassign", ACTION_ASSIGN, request.id),
        button("Mark In Progress", ACTION_IN_PROGRESS, request.id),
        button("Needs Information", ACTION_NEEDS_INFO, request.id),
        button("Mark Complete", ACTION_COMPLETE, request.id, "primary"),
        button("Cancel Request", ACTION_CANCEL, request.id, "danger")
      ];

  return [
    {
      type: "header",
      text: { type: "plain_text", text: `Rate Request ${request.requestNumber}` }
    },
    {
      type: "section",
      fields: [
        mrkdwnField("*Request Type*", request.requestType),
        mrkdwnField("*Brand*", request.brandName),
        mrkdwnField("*Lead Contact*", leadContactSummary(request)),
        mrkdwnField("*Requester*", requesterMention(request), { raw: true }),
        mrkdwnField("*Requester Email*", request.requesterEmail),
        mrkdwnField("*Status*", request.status),
        mrkdwnField("*Submitted*", formatSlackDate(request.createdAt), { raw: true }),
        mrkdwnField("*Assigned User*", assigned),
        mrkdwnField("*Salesforce*", salesforceSummary(request), { raw: true })
      ]
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Request Options*\n${requestOptionsSummary(request)}` }
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Description*\n${escapeMrkdwn(request.description)}` }
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Attachments*\n${formatFiles(request.files)}` }
    },
    {
      type: "actions",
      elements: actionElements
    }
  ];
}

export function buildRequesterConfirmationBlocks(input: {
  request: RateRequest;
  messageLink: string;
}): KnownBlock[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: `Rate request ${input.request.requestNumber} received` }
    },
    {
      type: "section",
      fields: [
        mrkdwnField("*Request ID*", input.request.requestNumber),
        mrkdwnField("*Request Type*", input.request.requestType),
        mrkdwnField("*Brand*", input.request.brandName),
        mrkdwnField("*Current Status*", input.request.status)
      ]
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `<${input.messageLink}|Open the channel message>` }
    }
  ];
}

export function formatFiles(files: SlackFile[]): string {
  if (files.length === 0) return "None";
  return files.map((file) => (file.permalink ? `<${file.permalink}|${escapeMrkdwn(file.name)}>` : escapeMrkdwn(file.name))).join("\n");
}

export function formatSlackDate(isoDate: string): string {
  const timestamp = Math.floor(new Date(isoDate).getTime() / 1000);
  return `<!date^${timestamp}^{date_short_pretty} at {time}|${isoDate}>`;
}

function mrkdwnField(label: string, value: string, options: { raw?: boolean } = {}) {
  return {
    type: "mrkdwn" as const,
    text: `${label}\n${options.raw ? value : escapeMrkdwn(value)}`
  };
}

function leadContactSummary(request: RateRequest) {
  const name = [request.leadFirstName, request.leadLastName].filter(Boolean).join(" ") || "Not provided";
  const details = [request.leadEmail, request.leadPhone, request.leadWebsite].filter(Boolean).join(" | ");
  return details ? `${name}\n${details}` : name;
}

function requestOptionsSummary(request: RateRequest) {
  if (request.requestType === "B3PL") {
    return `B3PL Tier: ${escapeMrkdwn(b3plTierSummary(request.b3plTier) || "Not selected")}`;
  }

  return [
    `Carriers: ${request.carriers.length > 0 ? request.carriers.map(escapeMrkdwn).join(", ") : "Not selected"}`,
    `Service Model: ${escapeMrkdwn(request.serviceModel ?? "Not selected")}`,
    `Soapbox Tier: ${escapeMrkdwn(sbTierSummary(request.sbTier) || "Not selected")}`
  ].join("\n");
}

function salesforceSummary(request: RateRequest) {
  if (!request.salesforceObjectType || !request.salesforceRecordId) return "Not created";
  return `${request.salesforceObjectType} ${request.salesforceRecordId}`;
}

function requesterMention(request: RateRequest) {
  return `<@${request.requesterSlackId}> (${escapeMrkdwn(request.requesterName)})`;
}

function button(text: string, actionId: string, requestId: number, style?: "primary" | "danger") {
  return {
    type: "button" as const,
    text: { type: "plain_text" as const, text },
    action_id: actionId,
    value: String(requestId),
    ...(style ? { style } : {})
  };
}

function escapeMrkdwn(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}


