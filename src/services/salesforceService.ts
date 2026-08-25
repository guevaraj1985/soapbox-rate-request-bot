import type { WebClient } from "@slack/web-api";
import { config } from "../config.js";
import type { RateRequest, SlackFile } from "../types.js";
import { b3plTierSummary, sbTierSummary } from "../slack/formOptions.js";

export type SalesforceObjectType = "Lead" | "Opportunity";
export type SalesforcePayload = Record<string, string>;

export type SalesforceCreateResult = {
  objectType: SalesforceObjectType;
  id: string;
  url: string;
  created: boolean;
  duplicateReason?: string;
};

export type SalesforceFileResult = {
  fileName: string;
  contentVersionId?: string;
  success: boolean;
  error?: string;
};

export type SalesforceNoteResult = {
  noteId: string;
  linkId: string;
};

type TokenResponse = {
  access_token: string;
  instance_url: string;
};

type ExistingRecord = {
  objectType: SalesforceObjectType;
  id: string;
  reason: string;
};

export function isSalesforceConfigured() {
  return Boolean(config.SALESFORCE_ENABLED && config.SALESFORCE_CLIENT_ID && config.SALESFORCE_CLIENT_SECRET);
}

export function buildSalesforcePayload(request: RateRequest): { objectType: SalesforceObjectType; payload: SalesforcePayload } {
  const objectType = config.SALESFORCE_OBJECT_TYPE;
  const payload = objectType === "Opportunity" ? opportunityPayload(request) : leadPayload(request);
  return { objectType, payload };
}

export async function createSalesforceRecord(request: RateRequest): Promise<SalesforceCreateResult> {
  if (!isSalesforceConfigured()) {
    throw new Error("Salesforce integration is enabled but client credentials are not configured.");
  }

  const token = await getAccessToken();
  const { objectType, payload } = buildSalesforcePayload(request);
  const existing = await findExistingRecord(token, objectType, request);
  if (existing) {
    return {
      objectType: existing.objectType,
      id: existing.id,
      url: `${token.instance_url}/${existing.id}`,
      created: false,
      duplicateReason: existing.reason
    };
  }

  const endpoint = `${token.instance_url}/services/data/${config.SALESFORCE_API_VERSION}/sobjects/${objectType}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const body = (await response.json()) as { id?: string; errors?: unknown[]; message?: string } | unknown[];
  if (!response.ok || Array.isArray(body) || !body.id) {
    throw new Error(`Salesforce ${objectType} create failed: ${JSON.stringify(body)}`);
  }

  return {
    objectType,
    id: body.id,
    url: `${token.instance_url}/${body.id}`,
    created: true
  };
}

export async function attachSalesforceFiles(
  request: RateRequest,
  salesforceRecordId: string,
  slackClient: WebClient,
  files: SlackFile[] = request.files
): Promise<SalesforceFileResult[]> {
  if (!config.SALESFORCE_ATTACH_FILES || files.length === 0) return [];

  const token = await getAccessToken();
  const results: SalesforceFileResult[] = [];

  for (const file of files) {
    try {
      const download = await downloadSlackFile(file, slackClient);
      const contentVersionId = await createContentVersion(token, {
        recordId: salesforceRecordId,
        fileName: download.fileName,
        content: download.content
      });
      results.push({ fileName: download.fileName, contentVersionId, success: true });
    } catch (error) {
      results.push({ fileName: file.name, success: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return results;
}

export async function createSalesforceCompletionNote(input: {
  request: RateRequest;
  salesforceRecordId: string;
  summary: string;
  actor: { id: string; name: string };
  files: SlackFile[];
  slackThreadUrl?: string;
  conversationRecap?: string;
}): Promise<SalesforceNoteResult> {
  const token = await getAccessToken();
  const noteId = await createContentNote(token, {
    title: `Rate Request ${input.request.requestNumber} Completion Notes`,
    body: buildSalesforceCompletionNoteBody(input)
  });
  const linkId = await linkContentDocument(token, {
    contentDocumentId: noteId,
    linkedEntityId: input.salesforceRecordId
  });
  return { noteId, linkId };
}

export function buildSalesforceCompletionNoteBody(input: {
  request: RateRequest;
  summary: string;
  actor: { id: string; name: string };
  files: SlackFile[];
  slackThreadUrl?: string;
  conversationRecap?: string;
}) {
  return [
    `Request ID: ${input.request.requestNumber}`,
    `Selected Tier: ${selectedTierSummary(input.request)}`,
    input.slackThreadUrl ? `Slack Conversation: ${input.slackThreadUrl}` : undefined,
    "",
    "Final Notes:",
    input.summary.trim() || "None provided",
    "",
    input.conversationRecap ? "Conversation Recap:" : undefined,
    input.conversationRecap,
    input.conversationRecap ? "" : undefined,
    "Final Files:",
    ...(input.files.length > 0 ? input.files.map((file) => `${file.name}${file.permalink ? ` - ${file.permalink}` : ""}`) : ["None"])
  ].filter((line): line is string => line !== undefined).join("\n");
}

function selectedTierSummary(request: RateRequest) {
  if (request.requestType === "B3PL") return b3plTierSummary(request.b3plTier) || "Not selected";
  return sbTierSummary(request.sbTier) || "Not selected";
}

async function getAccessToken(): Promise<TokenResponse> {
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.SALESFORCE_CLIENT_ID ?? "",
    client_secret: config.SALESFORCE_CLIENT_SECRET ?? ""
  });

  const response = await fetch(`${config.SALESFORCE_LOGIN_URL}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });
  const body = (await response.json()) as Partial<TokenResponse> & { error?: string; error_description?: string };

  if (!response.ok || !body.access_token || !body.instance_url) {
    throw new Error(`Salesforce auth failed: ${body.error_description ?? body.error ?? response.statusText}`);
  }

  return { access_token: body.access_token, instance_url: body.instance_url };
}

async function findExistingRecord(token: TokenResponse, objectType: SalesforceObjectType, request: RateRequest): Promise<ExistingRecord | undefined> {
  if (objectType === "Opportunity") {
    return findExistingOpportunity(token, request);
  }

  const leadMatch = await findExistingLead(token, request);
  if (leadMatch) return leadMatch;

  return findExistingOpportunity(token, request);
}

async function findExistingLead(token: TokenResponse, request: RateRequest): Promise<ExistingRecord | undefined> {
  for (const check of buildSalesforceLeadDuplicateChecks(request)) {
    const id = await queryRecordId(token, check.soql);
    if (id) return { objectType: "Lead", id, reason: check.reason };
  }

  return undefined;
}

async function findExistingOpportunity(token: TokenResponse, request: RateRequest): Promise<ExistingRecord | undefined> {
  const opportunityMatch = await queryRecordId(token, buildSalesforceOpportunityDuplicateQuery(request));
  if (opportunityMatch) return { objectType: "Opportunity", id: opportunityMatch, reason: "Existing open Opportunity match" };
  return undefined;
}

function leadNameWhereClause(request: RateRequest) {
  const firstName = request.leadFirstName?.trim();
  const lastName = request.leadLastName?.trim();
  if (firstName && lastName) return `FirstName = '${escapeSoql(firstName)}' AND LastName = '${escapeSoql(lastName)}'`;
  if (lastName) return `LastName = '${escapeSoql(lastName)}'`;
  return "";
}

function opportunityContactNameWhereClause(request: RateRequest) {
  const fullName = [request.leadFirstName, request.leadLastName].filter(Boolean).join(" ").trim();
  if (!fullName) return "";
  return `Name LIKE '%${escapeSoqlLike(fullName)}%'`;
}

export function buildSalesforceLeadDuplicateChecks(request: RateRequest) {
  const checks: Array<{ soql: string; reason: string }> = [];

  if (request.messageTs) {
    checks.push({
      soql: `SELECT Id FROM Lead WHERE Slack_Thread_ID__c = '${escapeSoql(request.messageTs)}' LIMIT 1`,
      reason: "Slack thread match"
    });
  }

  if (request.leadEmail) {
    checks.push({
      soql: `SELECT Id FROM Lead WHERE Email = '${escapeSoql(request.leadEmail)}' AND IsConverted = false LIMIT 1`,
      reason: "Existing unconverted Lead email match"
    });
  }

  const leadName = leadNameWhereClause(request);
  if (leadName) {
    checks.push({
      soql: `SELECT Id FROM Lead WHERE ${leadName} AND IsConverted = false LIMIT 1`,
      reason: "Existing unconverted Lead name match"
    });
  }

  if (request.brandName) {
    checks.push({
      soql: `SELECT Id FROM Lead WHERE Company = '${escapeSoql(request.brandName)}' AND IsConverted = false LIMIT 1`,
      reason: "Existing unconverted Lead company match"
    });
  }

  return checks;
}

export function buildSalesforceOpportunityDuplicateQuery(request: RateRequest) {
  const brand = escapeSoql(request.brandName);
  const brandLike = escapeSoqlLike(request.brandName);
  const nameClause = opportunityContactNameWhereClause(request);
  const contactNameFilter = nameClause ? ` OR ${nameClause}` : "";
  return `SELECT Id FROM Opportunity WHERE IsClosed = false AND (Account.Name = '${brand}' OR Name LIKE '%${brandLike}%'${contactNameFilter}) LIMIT 1`;
}

async function queryRecordId(token: TokenResponse, soql: string) {
  const endpoint = `${token.instance_url}/services/data/${config.SALESFORCE_API_VERSION}/query?q=${encodeURIComponent(soql)}`;
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token.access_token}` }
  });
  const body = (await response.json()) as { records?: Array<{ Id?: string }> };
  if (!response.ok || !Array.isArray(body.records)) {
    throw new Error(`Salesforce duplicate check failed: ${JSON.stringify(body)}`);
  }
  return body.records[0]?.Id;
}

function leadPayload(request: RateRequest): SalesforcePayload {
  return compactPayload({
    Company: request.brandName,
    FirstName: request.leadFirstName ?? undefined,
    LastName: request.leadLastName ?? undefined,
    Email: request.leadEmail ?? undefined,
    Phone: request.leadPhone ?? undefined,
    Website: request.leadWebsite ?? undefined,
    Status: config.SALESFORCE_LEAD_STATUS,
    LeadSource: salesforceLeadSource(request),
    Type__c: config.SALESFORCE_LEAD_TYPE,
    Nature_of_Interest__c: request.requestNumber,
    message__c: request.description,
    Description: salesforceDescription(request),
    Slack_Thread_ID__c: request.messageTs ?? undefined
  });
}

function opportunityPayload(request: RateRequest): SalesforcePayload {
  return {
    Name: `${request.brandName} - ${request.requestNumber}`,
    StageName: config.SALESFORCE_OPPORTUNITY_STAGE,
    CloseDate: closeDate(config.SALESFORCE_OPPORTUNITY_CLOSE_DAYS),
    Description: salesforceDescription(request)
  };
}

function salesforceLeadSource(request: RateRequest) {
  return request.requestType === "B3PL" ? config.SALESFORCE_B3PL_LEAD_SOURCE : config.SALESFORCE_LEAD_SOURCE;
}

function salesforceDescription(request: RateRequest) {
  return [
    `Rate Request: ${request.requestNumber}`,
    `Request Type: ${request.requestType}`,
    `Brand: ${request.brandName}`,
    ...salesforceRequestOptionLines(request),
    `Lead Contact: ${[request.leadFirstName, request.leadLastName].filter(Boolean).join(" ")}`,
    request.leadEmail ? `Lead Email: ${request.leadEmail}` : undefined,
    request.leadPhone ? `Lead Phone: ${request.leadPhone}` : undefined,
    request.leadWebsite ? `Website: ${request.leadWebsite}` : undefined,
    `Soapbox Requester: ${request.requesterName} <${request.requesterEmail}>`,
    `Slack User: ${request.requesterSlackId}`,
    request.channelId && request.messageTs ? `Slack Thread: ${request.channelId}/${request.messageTs}` : undefined,
    `Status: ${request.status}`,
    "",
    request.description,
    "",
    "Attachments:",
    ...request.files.map((file) => `${file.name}${file.permalink ? ` - ${file.permalink}` : ""}`)
  ].filter((line): line is string => line !== undefined).join("\n");
}

function salesforceRequestOptionLines(request: RateRequest) {
  if (request.requestType === "B3PL") {
    return [`Tier: ${b3plTierSummary(request.b3plTier) || "Not selected"}`];
  }

  return [
    `Soapbox Option: ${request.soapboxOption ?? "Not selected"}`,
    `Service Model: ${request.serviceModel ?? "Not selected"}`,
    `Tier: ${sbTierSummary(request.sbTier) || "Not selected"}`
  ];
}

async function downloadSlackFile(file: SlackFile, slackClient: WebClient) {
  const info = await slackClient.files.info({ file: file.id });
  const slackFile = info.file as { url_private_download?: string; url_private?: string; name?: string; title?: string } | undefined;
  const url = slackFile?.url_private_download ?? slackFile?.url_private;
  if (!url) throw new Error("Slack did not return a private download URL for this file.");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${config.SLACK_BOT_TOKEN}` }
  });
  if (!response.ok) throw new Error(`Slack file download failed: ${response.status} ${response.statusText}`);

  return {
    fileName: slackFile?.name ?? file.name,
    content: Buffer.from(await response.arrayBuffer())
  };
}

async function createContentVersion(token: TokenResponse, input: { recordId: string; fileName: string; content: Buffer }) {
  const endpoint = `${token.instance_url}/services/data/${config.SALESFORCE_API_VERSION}/sobjects/ContentVersion`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      Title: titleFromFileName(input.fileName),
      PathOnClient: input.fileName,
      VersionData: input.content.toString("base64"),
      FirstPublishLocationId: input.recordId
    })
  });
  const body = (await response.json()) as { id?: string } | unknown[];
  if (!response.ok || Array.isArray(body) || !body.id) {
    throw new Error(`Salesforce file upload failed: ${JSON.stringify(body)}`);
  }
  return body.id;
}

async function createContentNote(token: TokenResponse, input: { title: string; body: string }) {
  const endpoint = `${token.instance_url}/services/data/${config.SALESFORCE_API_VERSION}/sobjects/ContentNote`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      Title: input.title,
      Content: Buffer.from(input.body, "utf8").toString("base64")
    })
  });
  const body = (await response.json()) as { id?: string } | unknown[];
  if (!response.ok || Array.isArray(body) || !body.id) {
    throw new Error(`Salesforce note creation failed: ${JSON.stringify(body)}`);
  }
  return body.id;
}

async function linkContentDocument(token: TokenResponse, input: { contentDocumentId: string; linkedEntityId: string }) {
  const endpoint = `${token.instance_url}/services/data/${config.SALESFORCE_API_VERSION}/sobjects/ContentDocumentLink`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ContentDocumentId: input.contentDocumentId,
      LinkedEntityId: input.linkedEntityId,
      ShareType: "V",
      Visibility: "AllUsers"
    })
  });
  const body = (await response.json()) as { id?: string } | unknown[];
  if (!response.ok || Array.isArray(body) || !body.id) {
    throw new Error(`Salesforce note link failed: ${JSON.stringify(body)}`);
  }
  return body.id;
}

function titleFromFileName(fileName: string) {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
}

function compactPayload(payload: Record<string, string | undefined>): SalesforcePayload {
  return Object.fromEntries(Object.entries(payload).filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== ""));
}

function closeDate(daysFromToday: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

function escapeSoql(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function escapeSoqlLike(value: string) {
  return escapeSoql(value).replace(/%/g, "\\%").replace(/_/g, "\\_");
}







