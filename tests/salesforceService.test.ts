import { describe, expect, it } from "vitest";
import { buildSalesforceCompletionNoteBody, buildSalesforceLeadDuplicateChecks, buildSalesforceOpportunityDuplicateQuery, buildSalesforcePayload } from "../src/services/salesforceService.js";
import type { RateRequest } from "../src/types.js";

function request(overrides: Partial<RateRequest> = {}): RateRequest {
  return {
    id: 1,
    requestNumber: "RR-20260804-0001",
    requesterSlackId: "U123",
    requesterName: "Jane Employee",
    requesterEmail: "jane.employee@onsoapbox.com",
    requestType: "Soapbox",
    carriers: [],
    soapboxOption: "Whitelist",
    serviceModel: "WMS",
    sbTier: "Enterprise (T3)",
    brandName: "Test Brand",
    leadFirstName: "Pat",
    leadLastName: "Prospect",
    leadEmail: "pat@testbrand.com",
    leadPhone: "555-0100",
    leadWebsite: "https://testbrand.com",
    description: "Need carrier rate comparison for Shopify shipments.",
    priority: "Normal",
    status: "Open",
    channelId: "C08071S2P8E",
    messageTs: "1785900000.000000",
    createdAt: "2026-08-04T20:00:00.000Z",
    updatedAt: "2026-08-04T20:00:00.000Z",
    files: [{ id: "F123", name: "shipments.xlsx", filetype: "xlsx", permalink: "https://slack.test/file" }],
    ...overrides
  };
}

describe("Salesforce payload", () => {
  it("builds a Soapbox Lead payload from prospect fields, not the Soapbox requester", () => {
    const result = buildSalesforcePayload(request());

    expect(result.objectType).toBe("Lead");
    expect(result.payload).toMatchObject({
      Company: "Test Brand",
      FirstName: "Pat",
      LastName: "Prospect",
      Email: "pat@testbrand.com",
      Phone: "555-0100",
      Website: "https://testbrand.com",
      Status: "Open - Not Contacted",
      LeadSource: "Slack Rate Request Form",
      Type__c: "Shipper (Brand)",
      Nature_of_Interest__c: "RR-20260804-0001",
      message__c: "Need carrier rate comparison for Shopify shipments.",
      Slack_Thread_ID__c: "1785900000.000000"
    });
    expect(result.payload.Email).not.toBe("jane.employee@onsoapbox.com");
    expect(result.payload.Metadata__c).toBeUndefined();
    expect(result.payload.Description).toContain("Request Type: Soapbox");
    expect(result.payload.Description).toContain("Soapbox Option: Whitelist");
    expect(result.payload.Description).toContain("Service Model: WMS");
    expect(result.payload.Description).toContain("Tier: Enterprise (T3)");
    expect(result.payload.Description).toContain("Soapbox Requester: Jane Employee");
  });

  it("uses B3PL uplift tier details for Soapbox Basic3PL service requests", () => {
    const result = buildSalesforcePayload(request({
      serviceModel: "Basic3PL",
      sbTier: null,
      b3plTier: "Promo"
    }));

    expect(result.payload.LeadSource).toBe("Slack Rate Request Form");
    expect(result.payload.Description).toContain("Request Type: Soapbox");
    expect(result.payload.Description).toContain("Service Model: Basic3PL");
    expect(result.payload.Description).toContain("Tier: Promo (Separate Basic3PL uplifts services / Separate Basic3PL uplifts shipping)");
  });
  it("uses the B3PL lead source and B3PL tier details", () => {
    const result = buildSalesforcePayload(request({
      requestType: "B3PL",
      carriers: [],
      soapboxOption: null,
      serviceModel: null,
      sbTier: null,
      b3plTier: "Commercial"
    }));

    expect(result.payload.LeadSource).toBe("B3PL Slack Rate Request Form");
    expect(result.payload.Description).toContain("Request Type: B3PL");
    expect(result.payload.Description).toContain("Tier: Commercial (50% services / 30% shipping)");
  });

  it("builds precise completion notes for Salesforce Notes, not metadata", () => {
    const body = buildSalesforceCompletionNoteBody({
      request: request(),
      summary: "Final uplift: 12%. Use carrier mix A for Ground.",
      actor: { id: "U456", name: "Casey Analyst" },
      files: [{ id: "F456", name: "final-rates.xlsx", filetype: "xlsx", permalink: "https://slack.test/final" }],
      slackThreadUrl: "https://slack.test/thread",
      conversationRecap: "- Request created.\n- Analyst confirmed final rate card."
    });

    expect(body).toContain("Request ID: RR-20260804-0001");
    expect(body).toContain("Selected Tier: Enterprise (T3) - FedEx 20% / UPS 20% / USPS 3%");
    expect(body).toContain("Slack Conversation: https://slack.test/thread");
    expect(body).toContain("Final Notes:\nFinal uplift: 12%. Use carrier mix A for Ground.");
    expect(body).toContain("Conversation Recap:\n- Request created.\n- Analyst confirmed final rate card.");
    expect(body).toContain("final-rates.xlsx - https://slack.test/final");
    expect(body).not.toContain("Completed By:");
    expect(body).not.toContain("Completed At:");
    expect(body).not.toContain("Metadata__c");
  });

  it("builds duplicate checks for Slack thread, lead email, lead name, company, and opportunity", () => {
    const leadChecks = buildSalesforceLeadDuplicateChecks(request({
      brandName: "O'Brien 100% Brand",
      leadFirstName: "Pat",
      leadLastName: "O'Prospect",
      leadEmail: "pat@example.com",
      messageTs: "1785900000.000000"
    }));

    expect(leadChecks.map((check) => check.reason)).toEqual([
      "Slack thread match",
      "Existing unconverted Lead email match",
      "Existing unconverted Lead name match",
      "Existing unconverted Lead company match"
    ]);
    expect(leadChecks[1].soql).toContain("Email = 'pat@example.com'");
    expect(leadChecks[2].soql).toContain("FirstName = 'Pat' AND LastName = 'O\\'Prospect'");
    expect(leadChecks[3].soql).toContain("Company = 'O\\'Brien 100% Brand'");

    const opportunityQuery = buildSalesforceOpportunityDuplicateQuery(request({
      brandName: "O'Brien 100% Brand",
      leadFirstName: "Pat",
      leadLastName: "O'Prospect"
    }));

    expect(opportunityQuery).toContain("Account.Name = 'O\\'Brien 100% Brand'");
    expect(opportunityQuery).toContain("Name LIKE '%O\\'Brien 100\\% Brand%'");
    expect(opportunityQuery).toContain("Name LIKE '%Pat O\\'Prospect%'");
  });
});
