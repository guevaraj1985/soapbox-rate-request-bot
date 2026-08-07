import { describe, expect, it } from "vitest";
import { buildRequestMessageBlocks } from "../src/slack/messageBuilders.js";
import type { RateRequest } from "../src/types.js";

function request(overrides: Partial<RateRequest> = {}): RateRequest {
  return {
    id: 1,
    requestNumber: "RR-20260804-0001",
    requesterSlackId: "U123",
    requesterName: "Jane Requester",
    requesterEmail: "jane@example.com",
    requestType: "Soapbox",
    carriers: ["FedEx", "UPS"],
    serviceModel: "Soapbox Shipping Rates",
    sbTier: "Reseller (T2)",
    brandName: "Test Brand",
    leadLastName: "Prospect",
    description: "Need pricing review.",
    priority: "Normal",
    status: "Open",
    createdAt: "2026-08-04T20:00:00.000Z",
    updatedAt: "2026-08-04T20:00:00.000Z",
    files: [],
    ...overrides
  };
}

function buttonLabels(request: RateRequest) {
  const actions = buildRequestMessageBlocks(request).find((block) => block.type === "actions") as { elements: Array<{ text?: { text?: string } }> } | undefined;
  return actions?.elements.map((element) => element.text?.text).filter(Boolean) ?? [];
}

function blockText(request: RateRequest) {
  return JSON.stringify(buildRequestMessageBlocks(request));
}

describe("Slack request message buttons", () => {
  it("shows Reassign for assignment changes", () => {
    expect(buttonLabels(request())).toContain("Reassign");
    expect(buttonLabels(request({ assignedSlackId: "U456", assignedName: "Casey Analyst" }))).toContain("Reassign");
  });

  it("shows conditional request option summaries", () => {
    expect(blockText(request())).toContain("Request Type");
    expect(blockText(request())).toContain("Carriers: FedEx, UPS");
    expect(blockText(request({ requestType: "B3PL", carriers: [], serviceModel: null, sbTier: null, b3plTier: "Enterprise" }))).toContain("B3PL Tier: Enterprise");
  });

  it("shows Mark Complete while a request is still open", () => {
    const labels = buttonLabels(request());
    expect(labels).toContain("Mark Complete");
    expect(labels).not.toContain("Reopen Request");
  });

  it("only shows Reopen Request after a request is complete", () => {
    expect(buttonLabels(request({ status: "Complete" }))).toEqual(["Reopen Request"]);
  });
});

