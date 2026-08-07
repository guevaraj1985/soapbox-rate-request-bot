import type { KnownBlock, ModalView, PlainTextOption } from "@slack/types";
import type { B3plTier, Carrier, RateRequest, RequestType, SbTier, ServiceModel } from "../types.js";
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
  ACTION_SEND_TEMPLATE,
  ACTION_SERVICE_MODEL,
  ASSIGN_VIEW,
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
  BLOCK_SERVICE_MODEL,
  CANCEL_VIEW,
  COMPLETE_VIEW,
  NEEDS_INFO_VIEW,
  RATE_REQUEST_VIEW
} from "./constants.js";
import { b3plTierDetails, b3plTiers, carriers, requestTypes, sbTierSummary, sbTiers, serviceModels } from "./formOptions.js";

const acceptedFileTypes = ["csv", "xls", "xlsx", "pdf", "png", "jpg", "jpeg", "zip"];

export function buildRateRequestModal(input: {
  requesterName: string;
  requesterEmail: string;
  templateUrl?: string;
  templateFileEnabled?: boolean;
  selectedRequestType?: RequestType;
  selectedCarrierValues?: string[];
  carrierSelectAllActive?: boolean;
}): ModalView {
  const selectedRequestType = input.selectedRequestType ?? "Soapbox";
  const templateAccessory = input.templateUrl
    ? {
        type: "button" as const,
        text: { type: "plain_text" as const, text: "Download Template" },
        url: input.templateUrl,
        action_id: "download_template"
      }
    : input.templateFileEnabled
      ? {
          type: "button" as const,
          text: { type: "plain_text" as const, text: "Send Template" },
          action_id: ACTION_SEND_TEMPLATE,
          value: "send_template"
        }
      : undefined;

  const introBlock = {
    type: "section" as const,
    text: {
      type: "mrkdwn" as const,
      text: "Submit a new rate request. Download and complete the shipment template when shipment-level data is required. Add SKU data on Sheet 1 and order data on Sheet 2."
    },
    ...(templateAccessory ? { accessory: templateAccessory } : {})
  };

  const requestTypeBlocks: KnownBlock[] = selectedRequestType === "B3PL" ? b3plRequestBlocks() : soapboxRequestBlocks(input.selectedCarrierValues ?? []);

  return {
    type: "modal",
    callback_id: RATE_REQUEST_VIEW,
    private_metadata: JSON.stringify({
      requesterName: input.requesterName,
      requesterEmail: input.requesterEmail,
      carrierSelectAllActive: Boolean(input.carrierSelectAllActive)
    }),
    title: { type: "plain_text", text: "Rate Request" },
    submit: { type: "plain_text", text: "Submit" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      introBlock,
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `*Requester:* ${input.requesterName} <${input.requesterEmail}>` }]
      },
      {
        type: "input",
        block_id: BLOCK_REQUEST_TYPE,
        dispatch_action: true,
        label: { type: "plain_text", text: "Request Type (Required)" },
        element: {
          type: "static_select",
          action_id: ACTION_REQUEST_TYPE,
          initial_option: requestTypeOption(selectedRequestType),
          options: requestTypes.map(requestTypeOption)
        }
      },
      ...requestTypeBlocks,
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Salesforce Lead fields*\nThe Lead should represent the prospect or brand, not the Soapbox employee submitting this request."
        }
      },
      {
        type: "input",
        block_id: BLOCK_BRAND,
        label: { type: "plain_text", text: "Brand / Company Name (Required)" },
        element: {
          type: "plain_text_input",
          action_id: ACTION_BRAND,
          max_length: 150
        }
      },
      {
        type: "input",
        block_id: BLOCK_LEAD_NAME,
        label: { type: "plain_text", text: "Lead Contact Name (Required)" },
        hint: { type: "plain_text", text: "Required by Salesforce. Enter the prospect's full name when known, for example Dutch Italiano; otherwise use Unknown." },
        element: {
          type: "plain_text_input",
          action_id: ACTION_LEAD_NAME,
          max_length: 121
        }
      },
      {
        type: "input",
        block_id: BLOCK_LEAD_EMAIL,
        label: { type: "plain_text", text: "Lead Contact Email (Required)" },
        element: {
          type: "email_text_input",
          action_id: ACTION_LEAD_EMAIL
        }
      },
      {
        type: "input",
        block_id: BLOCK_LEAD_PHONE,
        optional: true,
        label: { type: "plain_text", text: "Lead Contact Phone" },
        element: {
          type: "plain_text_input",
          action_id: ACTION_LEAD_PHONE,
          max_length: 40
        }
      },
      {
        type: "input",
        block_id: BLOCK_LEAD_WEBSITE,
        optional: true,
        label: { type: "plain_text", text: "Company Website" },
        element: {
          type: "url_text_input",
          action_id: ACTION_LEAD_WEBSITE
        }
      },
      {
        type: "divider"
      },
      {
        type: "input",
        block_id: BLOCK_DESCRIPTION,
        label: { type: "plain_text", text: "Request Description (Required)" },
        hint: {
          type: "plain_text",
          text: "Include matching service levels, shipment assumptions, required comparisons, and any special pricing instructions."
        },
        element: {
          type: "plain_text_input",
          action_id: ACTION_DESCRIPTION,
          multiline: true
        }
      },
      {
        type: "input",
        block_id: BLOCK_FILES,
        optional: true,
        label: { type: "plain_text", text: "Attachments (Optional)" },
        element: {
          type: "file_input",
          action_id: ACTION_FILES,
          filetypes: acceptedFileTypes,
          max_files: 10
        }

      }
    ]
  };
}

function soapboxRequestBlocks(selectedCarrierValues: string[]): KnownBlock[] {
  return [
    {
      type: "input",
      block_id: BLOCK_CARRIERS,
      label: { type: "plain_text", text: "Carriers (Required)" },
      element: {
        type: "checkboxes",
        action_id: ACTION_CARRIERS,
        options: carrierOptions(),
        ...(selectedCarrierValues.length > 0 ? { initial_options: carrierOptions().filter((option) => Boolean(option.value && selectedCarrierValues.includes(option.value))) } : {})
      }
    },
    {
      type: "input",
      block_id: BLOCK_SERVICE_MODEL,
      label: { type: "plain_text", text: "Service Model (Required)" },
      element: {
        type: "static_select",
        action_id: ACTION_SERVICE_MODEL,
        options: serviceModels.map(serviceModelOption)
      }
    },
    {
      type: "input",
      block_id: BLOCK_SB_TIER,
      label: { type: "plain_text", text: "Soapbox Tier (Required)" },
      element: {
        type: "static_select",
        action_id: ACTION_SB_TIER,
        options: sbTiers.map(sbTierOption)
      }
    }
  ];
}

function b3plRequestBlocks(): KnownBlock[] {
  return [
    {
      type: "input",
      block_id: BLOCK_B3PL_TIER,
      label: { type: "plain_text", text: "B3PL Tier (Required)" },
      element: {
        type: "static_select",
        action_id: ACTION_B3PL_TIER,
        options: b3plTiers.map(b3plTierOption)
      }
    }
  ];
}

export function buildAssignModal(request: RateRequest): ModalView {
  return {
    type: "modal",
    callback_id: ASSIGN_VIEW,
    private_metadata: String(request.id),
    title: { type: "plain_text", text: "Assign Request" },
    submit: { type: "plain_text", text: "Assign" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: BLOCK_ASSIGN_USER,
        label: { type: "plain_text", text: "Assigned User" },
        element: {
          type: "users_select",
          action_id: ACTION_ASSIGN_USER,
          ...(request.assignedSlackId ? { initial_user: request.assignedSlackId } : {})
        }
      }
    ]
  };
}

export function buildNeedsInfoModal(request: RateRequest): ModalView {
  return {
    type: "modal",
    callback_id: NEEDS_INFO_VIEW,
    private_metadata: String(request.id),
    title: { type: "plain_text", text: "Needs Info" },
    submit: { type: "plain_text", text: "Post" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: BLOCK_NEEDS_INFO_NOTE,
        label: { type: "plain_text", text: "What information is needed?" },
        element: { type: "plain_text_input", action_id: ACTION_NEEDS_INFO_NOTE, multiline: true }
      }
    ]
  };
}

export function buildCompletionModal(request: RateRequest): ModalView {
  return {
    type: "modal",
    callback_id: COMPLETE_VIEW,
    private_metadata: String(request.id),
    title: { type: "plain_text", text: "Complete Request" },
    submit: { type: "plain_text", text: "Complete" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: BLOCK_COMPLETION_SUMMARY,
        label: { type: "plain_text", text: "Completion Summary" },
        element: { type: "plain_text_input", action_id: ACTION_COMPLETION_SUMMARY, multiline: true }
      },
      {
        type: "input",
        block_id: BLOCK_COMPLETION_FILES,
        optional: true,
        label: { type: "plain_text", text: "Result File Attachments" },
        element: {
          type: "file_input",
          action_id: ACTION_COMPLETION_FILES,
          filetypes: acceptedFileTypes,
          max_files: 10
        }
      }
    ]
  };
}

export function buildCancelConfirmationModal(request: RateRequest): ModalView {
  return {
    type: "modal",
    callback_id: CANCEL_VIEW,
    private_metadata: String(request.id),
    title: { type: "plain_text", text: "Cancel Request" },
    submit: { type: "plain_text", text: "Cancel Request" },
    close: { type: "plain_text", text: "Keep Open" },
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `Cancel *${request.requestNumber}* for *${request.brandName}*?` }
      }
    ]
  };
}


function carrierOptions() {
  return [...carriers.map(carrierOption), plainOption("Select all", "select_all")];
}
function requestTypeOption(value: RequestType) {
  return plainOption(value, value);
}

function carrierOption(value: Carrier) {
  return plainOption(value, value);
}

function serviceModelOption(value: ServiceModel) {
  return plainOption(value, value);
}

function sbTierOption(value: SbTier) {
  return plainOption(sbTierSummary(value), value);
}

function b3plTierOption(value: B3plTier) {
  const details = b3plTierDetails[value];
  return plainOption(`${value} - ${details.servicesUplift} services / ${details.shippingUplift} shipping`, value);
}


function plainOption(text: string, value: string): PlainTextOption {
  return {
    text: { type: "plain_text", text },
    value
  };
}









