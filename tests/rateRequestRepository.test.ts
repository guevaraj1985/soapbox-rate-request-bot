import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RateRequestRepository } from "../src/db/rateRequestRepository.js";

function createRepo() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  const migration = fs.readFileSync(path.resolve("migrations/001_init.sql"), "utf8");
  db.exec(migration);
  return new RateRequestRepository(db);
}

describe("RateRequestRepository", () => {
  it("generates sequential unique request numbers for the current UTC date", () => {
    const repo = createRepo();
    const first = repo.create({
      requesterSlackId: "U123",
      requesterName: "Jane Requester",
      requesterEmail: "jane@example.com",
      requestType: "Soapbox",
      carriers: ["FedEx", "UPS"],
      serviceModel: "Soapbox Shipping Rates",
      sbTier: "Marketplace (T1)",
      brandName: "Soapbox",
      leadLastName: "Prospect",
      description: "Compare carrier rates for matched service levels.",
      priority: "Normal",
      files: [{ id: "F1", name: "shipments.csv", filetype: "csv", permalink: "https://slack/files/F1" }]
    });
    const second = repo.create({
      requesterSlackId: "U123",
      requesterName: "Jane Requester",
      requesterEmail: "jane@example.com",
      requestType: "B3PL",
      carriers: [],
      b3plTier: "Commercial",
      brandName: "Another Brand",
      leadLastName: "Buyer",
      description: "Analyze shipment assumptions.",
      priority: "Normal",
      files: [{ id: "F2", name: "lanes.xlsx", filetype: "xlsx", permalink: "https://slack/files/F2" }]
    });

    expect(first.requestNumber).toMatch(/^RR-\d{8}-0001$/);
    expect(second.requestNumber).toMatch(/^RR-\d{8}-0002$/);
    expect(first.requestNumber).not.toEqual(second.requestNumber);
    expect(second.requestType).toBe("B3PL");
    expect(second.b3plTier).toBe("Commercial");
  });

  it("tracks assignment and status activity", () => {
    const repo = createRepo();
    const request = repo.create({
      requesterSlackId: "U123",
      requesterName: "Jane Requester",
      requesterEmail: "jane@example.com",
      requestType: "Soapbox",
      carriers: ["FedEx", "UPS", "USPS"],
      serviceModel: "WMS OR API",
      sbTier: "MM (T4)",
      brandName: "Soapbox",
      leadFirstName: "Pat",
      leadLastName: "Prospect",
      leadEmail: "pat.prospect@example.com",
      leadPhone: "555-0100",
      leadWebsite: "https://example.com",
      description: "Need pricing review.",
      priority: "Urgent",
      files: [{ id: "F1", name: "request.pdf", filetype: "pdf" }]
    });

    expect(request.requestType).toBe("Soapbox");
    expect(request.carriers).toEqual(["FedEx", "UPS", "USPS"]);
    expect(request.serviceModel).toBe("WMS OR API");
    expect(request.sbTier).toBe("MM (T4)");
    expect(request.leadFirstName).toBe("Pat");
    expect(request.leadLastName).toBe("Prospect");
    expect(request.leadEmail).toBe("pat.prospect@example.com");
    expect(request.leadPhone).toBe("555-0100");
    expect(request.leadWebsite).toBe("https://example.com");

    const assigned = repo.assign(request.id, "U456", "Casey Analyst");
    const progressed = repo.updateStatus(request.id, "In Progress", "U456", "Casey Analyst");

    expect(assigned.assignedSlackId).toBe("U456");
    expect(assigned.assignedName).toBe("Casey Analyst");
    expect(progressed.status).toBe("In Progress");
  });
});

