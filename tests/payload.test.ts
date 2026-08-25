import { describe, expect, it } from "vitest";
import { getAssignValues, getRateRequestValues, validateRateRequestValues } from "../src/slack/payload.js";

describe("Slack modal payload parsing", () => {
  it("extracts the selected assignment user", () => {
    expect(getAssignValues({ assign_user: { assign_user_value: { selected_user: "U456" } } })).toEqual({ userId: "U456" });
  });

  it("extracts Soapbox request values, Soapbox option, tier details, and submitted files", () => {
    const values = getRateRequestValues({
      request_type: { request_type_value: { selected_option: { value: "Soapbox" } } },
      soapbox_option: { soapbox_option_value: { selected_option: { value: "Whitelist" } } },
      service_model: { service_model_value: { selected_option: { value: "WMS" } } },
      sb_tier: { sb_tier_value: { selected_option: { value: "Enterprise (T3)" } } },
      brand: { brand_value: { value: "Soapbox" } },
      lead_name: { lead_name_value: { value: "Pat Prospect" } },
      lead_email: { lead_email_value: { value: "pat.prospect@example.com" } },
      lead_phone: { lead_phone_value: { value: "555-0100" } },
      lead_website: { lead_website_value: { value: "https://example.com" } },
      description: { description_value: { value: "Need matched rate comparisons." } },
      attachments: {
        attachments_value: {
          files: [{ id: "F123", name: "shipments.csv", filetype: "csv", permalink: "https://slack/files/F123" }]
        }
      }
    });

    expect(values).toEqual({
      requestType: "Soapbox",
      carriers: [],
      soapboxOption: "Whitelist",
      serviceModel: "WMS",
      sbTier: "Enterprise (T3)",
      b3plTier: undefined,
      brandName: "Soapbox",
      leadName: "Pat Prospect",
      leadFirstName: "Pat",
      leadLastName: "Prospect",
      leadEmail: "pat.prospect@example.com",
      leadPhone: "555-0100",
      leadWebsite: "https://example.com",
      description: "Need matched rate comparisons.",
      priority: "Normal",
      files: [{ id: "F123", name: "shipments.csv", filetype: "csv", permalink: "https://slack/files/F123", uploadedAt: undefined }]
    });
    expect(validateRateRequestValues(values)).toEqual({});
  });

  it("extracts Promo as a Basic3PL uplift tier for Soapbox Basic3PL service requests", () => {
    const values = getRateRequestValues({
      request_type: { request_type_value: { selected_option: { value: "Soapbox" } } },
      soapbox_option: { soapbox_option_value: { selected_option: { value: "National" } } },
      service_model: { service_model_value: { selected_option: { value: "Basic3PL" } } },
      b3pl_tier: { b3pl_tier_value: { selected_option: { value: "Promo" } } },
      brand: { brand_value: { value: "Soapbox" } },
      lead_name: { lead_name_value: { value: "Unknown" } },
      lead_email: { lead_email_value: { value: "unknown@example.com" } },
      description: { description_value: { value: "Need promo review." } },
      attachments: { attachments_value: { files: [{ id: "F123", name: "shipments.csv" }] } }
    });

    expect(values.carriers).toEqual([]);
    expect(values.soapboxOption).toBe("National");
    expect(values.serviceModel).toBe("Basic3PL");
    expect(values.sbTier).toBeUndefined();
    expect(values.b3plTier).toBe("Promo");
    expect(validateRateRequestValues(values)).toEqual({});
  });

  it("extracts B3PL request values and tier", () => {
    const values = getRateRequestValues({
      request_type: { request_type_value: { selected_option: { value: "B3PL" } } },
      b3pl_tier: { b3pl_tier_value: { selected_option: { value: "Promo" } } },
      brand: { brand_value: { value: "Basic3PL Prospect" } },
      lead_name: { lead_name_value: { value: "Dutch Italiano" } },
      lead_email: { lead_email_value: { value: "dutch@example.com" } },
      description: { description_value: { value: "Warehouse and shipping uplift review." } },
      attachments: { attachments_value: { files: [{ id: "F123", name: "shipments.csv" }] } }
    });

    expect(values.requestType).toBe("B3PL");
    expect(values.b3plTier).toBe("Promo");
    expect(values.carriers).toEqual([]);
    expect(values.soapboxOption).toBeUndefined();
    expect(values.serviceModel).toBeUndefined();
    expect(values.sbTier).toBeUndefined();
    expect(validateRateRequestValues(values)).toEqual({});
  });

  it("uses a single-word Lead Contact Name as Salesforce LastName", () => {
    const values = getRateRequestValues({
      request_type: { request_type_value: { selected_option: { value: "B3PL" } } },
      b3pl_tier: { b3pl_tier_value: { selected_option: { value: "Self Service" } } },
      brand: { brand_value: { value: "Soapbox" } },
      lead_name: { lead_name_value: { value: "Unknown" } },
      lead_email: { lead_email_value: { value: "unknown@example.com" } },
      description: { description_value: { value: "Need matched rate comparisons." } },
      attachments: { attachments_value: { files: [{ id: "F123", name: "shipments.csv" }] } }
    });

    expect(values.leadFirstName).toBe("");
    expect(values.leadLastName).toBe("Unknown");
    expect(validateRateRequestValues(values)).toEqual({});
  });

  it("returns Slack block errors for missing Soapbox required fields", () => {
    const values = getRateRequestValues({
      request_type: { request_type_value: { selected_option: { value: "Soapbox" } } },
      brand: { brand_value: { value: "" } },
      lead_name: { lead_name_value: { value: "" } },
      description: { description_value: { value: "" } },
      attachments: { attachments_value: { files: [] } }
    });

    expect(validateRateRequestValues(values)).toEqual({
      soapbox_option: "Soapbox option is required.",
      service_model: "Service model is required.",
      sb_tier: "Tier is required.",
      brand: "Brand/company name is required.",
      lead_name: "Lead contact name is required by Salesforce.",
      lead_email: "Lead contact email is required by Salesforce.",
      description: "Request description is required."
    });
  });
});