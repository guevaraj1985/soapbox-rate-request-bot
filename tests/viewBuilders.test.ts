import { describe, expect, it } from "vitest";
import { buildRateRequestModal } from "../src/slack/viewBuilders.js";

function blockIds(view: ReturnType<typeof buildRateRequestModal>) {
  return view.blocks.map((block) => "block_id" in block ? block.block_id : undefined).filter(Boolean);
}

describe("Rate request modal dynamic sections", () => {
  it("shows Soapbox tier options by default", () => {
    const view = buildRateRequestModal({ requesterName: "Jane", requesterEmail: "jane@example.com" });

    expect(blockIds(view)).toContain("sb_tier");
    expect(blockIds(view)).not.toContain("b3pl_tier");
  });

  it("shows B3PL tier options for top-level B3PL requests", () => {
    const view = buildRateRequestModal({ requesterName: "Jane", requesterEmail: "jane@example.com", selectedRequestType: "B3PL" });

    expect(blockIds(view)).toContain("b3pl_tier");
    expect(blockIds(view)).not.toContain("service_model");
    expect(blockIds(view)).not.toContain("sb_tier");
  });

  it("shows B3PL uplift tiers when Soapbox service model is Basic3PL", () => {
    const view = buildRateRequestModal({
      requesterName: "Jane",
      requesterEmail: "jane@example.com",
      selectedRequestType: "Soapbox",
      selectedServiceModel: "Basic3PL"
    });

    expect(blockIds(view)).toContain("soapbox_option");
    expect(blockIds(view)).toContain("service_model");
    expect(blockIds(view)).toContain("b3pl_tier");
    expect(blockIds(view)).not.toContain("sb_tier");
  });
});
