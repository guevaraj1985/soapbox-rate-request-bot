import type { B3plTier, Carrier, RequestType, SbTier, ServiceModel, SlackFile } from "../types.js";
import {
  ACTION_ASSIGN_USER,
  ACTION_B3PL_TIER,
  ACTION_BRAND,
  ACTION_CARRIERS,
  ACTION_COMPLETION_FILES,
  ACTION_COMPLETION_SUMMARY,
  ACTION_DESCRIPTION,
  ACTION_FILES,
  ACTION_LEAD_EMAIL,
  ACTION_LEAD_NAME,
  ACTION_LEAD_PHONE,
  ACTION_LEAD_WEBSITE,
  ACTION_NEEDS_INFO_NOTE,
  ACTION_REQUEST_TYPE,
  ACTION_SB_TIER,
  ACTION_SERVICE_MODEL,
  BLOCK_ASSIGN_USER,
  BLOCK_B3PL_TIER,
  BLOCK_BRAND,
  BLOCK_CARRIERS,
  BLOCK_COMPLETION_FILES,
  BLOCK_COMPLETION_SUMMARY,
  BLOCK_DESCRIPTION,
  BLOCK_FILES,
  BLOCK_LEAD_EMAIL,
  BLOCK_LEAD_NAME,
  BLOCK_LEAD_PHONE,
  BLOCK_LEAD_WEBSITE,
  BLOCK_NEEDS_INFO_NOTE,
  BLOCK_REQUEST_TYPE,
  BLOCK_SB_TIER,
  BLOCK_SERVICE_MODEL
} from "./constants.js";
import { carriers, isB3plTier, isCarrier, isRequestType, isServiceModel, normalizeSbTier } from "./formOptions.js";

type ViewState = Record<string, Record<string, Record<string, unknown>>>;

export function getRateRequestValues(state: ViewState) {
  const leadName = textValue(state, BLOCK_LEAD_NAME, ACTION_LEAD_NAME);
  const parsedLeadName = parseLeadName(leadName);
  const requestType = selectedRequestType(state, BLOCK_REQUEST_TYPE, ACTION_REQUEST_TYPE);

  return {
    requestType,
    carriers: requestType === "Soapbox" ? selectedCarriers(state, BLOCK_CARRIERS, ACTION_CARRIERS) : [],
    serviceModel: requestType === "Soapbox" ? selectedServiceModel(state, BLOCK_SERVICE_MODEL, ACTION_SERVICE_MODEL) : undefined,
    sbTier: requestType === "Soapbox" ? selectedSbTier(state, BLOCK_SB_TIER, ACTION_SB_TIER) : undefined,
    b3plTier: requestType === "B3PL" ? selectedB3plTier(state, BLOCK_B3PL_TIER, ACTION_B3PL_TIER) : undefined,
    brandName: textValue(state, BLOCK_BRAND, ACTION_BRAND),
    leadName,
    leadFirstName: parsedLeadName.firstName,
    leadLastName: parsedLeadName.lastName,
    leadEmail: textValue(state, BLOCK_LEAD_EMAIL, ACTION_LEAD_EMAIL),
    leadPhone: textValue(state, BLOCK_LEAD_PHONE, ACTION_LEAD_PHONE),
    leadWebsite: textValue(state, BLOCK_LEAD_WEBSITE, ACTION_LEAD_WEBSITE),
    description: textValue(state, BLOCK_DESCRIPTION, ACTION_DESCRIPTION),
    priority: "Normal" as const,
    files: fileValues(state, BLOCK_FILES, ACTION_FILES)
  };
}

export function getAssignValues(state: ViewState) {
  return {
    userId: selectedUserValue(state, BLOCK_ASSIGN_USER, ACTION_ASSIGN_USER)
  };
}

export function getNeedsInfoValues(state: ViewState) {
  return {
    note: textValue(state, BLOCK_NEEDS_INFO_NOTE, ACTION_NEEDS_INFO_NOTE)
  };
}

export function getCompletionValues(state: ViewState) {
  return {
    summary: textValue(state, BLOCK_COMPLETION_SUMMARY, ACTION_COMPLETION_SUMMARY),
    files: fileValues(state, BLOCK_COMPLETION_FILES, ACTION_COMPLETION_FILES)
  };
}

export function validateRateRequestValues(values: ReturnType<typeof getRateRequestValues>) {
  const errors: Record<string, string> = {};
  if (!values.requestType) errors[BLOCK_REQUEST_TYPE] = "Request type is required.";
  if (values.requestType === "Soapbox") {
    if (values.carriers.length < 1) errors[BLOCK_CARRIERS] = "Select at least one carrier.";
    if (!values.serviceModel) errors[BLOCK_SERVICE_MODEL] = "Service model is required.";
    if (!values.sbTier) errors[BLOCK_SB_TIER] = "Soapbox tier is required.";
  }
  if (values.requestType === "B3PL" && !values.b3plTier) errors[BLOCK_B3PL_TIER] = "B3PL tier is required.";
  if (!values.brandName.trim()) errors[BLOCK_BRAND] = "Brand/company name is required.";
  if (values.brandName.length > 150) errors[BLOCK_BRAND] = "Brand/company name must be 150 characters or fewer.";
  if (!values.leadName.trim()) errors[BLOCK_LEAD_NAME] = "Lead contact name is required by Salesforce.";
  if (values.leadName.length > 121) errors[BLOCK_LEAD_NAME] = "Lead contact name must be 121 characters or fewer.";
  if (values.leadFirstName.length > 40) errors[BLOCK_LEAD_NAME] = "Lead contact first name must be 40 characters or fewer.";
  if (values.leadLastName.length > 80) errors[BLOCK_LEAD_NAME] = "Lead contact last name must be 80 characters or fewer.";
  if (!values.leadEmail.trim()) errors[BLOCK_LEAD_EMAIL] = "Lead contact email is required by Salesforce.";
  if (values.leadPhone.length > 40) errors[BLOCK_LEAD_PHONE] = "Lead contact phone must be 40 characters or fewer.";
  if (!values.description.trim()) errors[BLOCK_DESCRIPTION] = "Request description is required.";
  if (values.files.length > 10) errors[BLOCK_FILES] = "Attach no more than 10 files.";
  return errors;
}

function parseLeadName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: "", lastName: parts[0] };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1]
  };
}

function textValue(state: ViewState, blockId: string, actionId: string): string {
  const value = state[blockId]?.[actionId]?.value;
  return typeof value === "string" ? value.trim() : "";
}

function selectedUserValue(state: ViewState, blockId: string, actionId: string): string {
  const selectedUser = state[blockId]?.[actionId]?.selected_user;
  return typeof selectedUser === "string" ? selectedUser : "";
}

function selectedRequestType(state: ViewState, blockId: string, actionId: string): RequestType {
  const value = selectedStringValue(state, blockId, actionId);
  return value && isRequestType(value) ? value : "Soapbox";
}


function selectedServiceModel(state: ViewState, blockId: string, actionId: string): ServiceModel | undefined {
  const value = selectedStringValue(state, blockId, actionId);
  return value && isServiceModel(value) ? value : undefined;
}

function selectedSbTier(state: ViewState, blockId: string, actionId: string): SbTier | undefined {
  const value = selectedStringValue(state, blockId, actionId);
  return normalizeSbTier(value);
}

function selectedB3plTier(state: ViewState, blockId: string, actionId: string): B3plTier | undefined {
  const value = selectedStringValue(state, blockId, actionId);
  return value && isB3plTier(value) ? value : undefined;
}

function selectedStringValue(state: ViewState, blockId: string, actionId: string): string | undefined {
  const selected = state[blockId]?.[actionId]?.selected_option;
  if (isObject(selected) && typeof selected.value === "string") return selected.value;
  return undefined;
}

function selectedCarriers(state: ViewState, blockId: string, actionId: string): Carrier[] {
  const selectedOptions = state[blockId]?.[actionId]?.selected_options;
  if (!Array.isArray(selectedOptions)) return [];
  const selectedValues = selectedOptions
    .filter(isObject)
    .map((option) => stringFrom(option.value))
    .filter(Boolean);
  const selectedCarrierValues = selectedValues.filter(isCarrier);
  if (selectedValues.includes("select_all") && (selectedCarrierValues.length === 0 || selectedCarrierValues.length === carriers.length)) {
    return [...carriers];
  }
  return selectedCarrierValues;
}

function fileValues(state: ViewState, blockId: string, actionId: string): SlackFile[] {
  const rawFiles = state[blockId]?.[actionId]?.files;
  if (!Array.isArray(rawFiles)) return [];

  return rawFiles
    .filter(isObject)
    .map((file) => ({
      id: stringFrom(file.id),
      name: stringFrom(file.name) || stringFrom(file.title) || stringFrom(file.id),
      filetype: stringFrom(file.filetype) || stringFrom(file.file_type) || undefined,
      permalink: stringFrom(file.permalink) || stringFrom(file.url_private) || undefined,
      uploadedAt: file.created ? new Date(Number(file.created) * 1000).toISOString() : undefined
    }))
    .filter((file) => file.id);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringFrom(value: unknown): string {
  return typeof value === "string" ? value : "";
}




