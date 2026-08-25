import type Database from "better-sqlite3";
import type { Carrier, RateRequest, RequestCreateInput, RequestStatus, RequestType, SlackFile } from "../types.js";
import { isB3plTier, isCarrier, isRequestType, isServiceModel, isSoapboxOption, normalizeSbTier } from "../slack/formOptions.js";

type RequestRow = {
  id: number;
  request_number: string;
  requester_slack_id: string;
  requester_name: string;
  requester_email: string;
  request_type: string | null;
  carriers_json: string | null;
  soapbox_option: string | null;
  service_model: string | null;
  sb_tier: string | null;
  b3pl_tier: string | null;
  brand_name: string;
  lead_first_name: string | null;
  lead_last_name: string | null;
  lead_email: string | null;
  lead_phone: string | null;
  lead_website: string | null;
  description: string;
  priority: "Normal" | "High" | "Urgent";
  status: RequestStatus;
  assigned_slack_id: string | null;
  assigned_name: string | null;
  channel_id: string | null;
  message_ts: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  salesforce_object_type: string | null;
  salesforce_record_id: string | null;
};

type FileRow = {
  slack_file_id: string;
  file_name: string;
  file_type: string | null;
  permalink: string | null;
  uploaded_at: string;
};

export class RateRequestRepository {
  constructor(private readonly db: Database.Database) {}

  create(input: RequestCreateInput): RateRequest {
    return this.db.transaction(() => {
      const now = new Date().toISOString();
      const dateKey = formatDateKey(new Date(now));
      const sequence = this.nextSequence(dateKey);
      const requestNumber = `RR-${dateKey}-${String(sequence).padStart(4, "0")}`;

      const result = this.db
        .prepare(
          `INSERT INTO rate_requests (
            request_number, requester_slack_id, requester_name, requester_email,
            request_type, carriers_json, soapbox_option, service_model, sb_tier, b3pl_tier,
            brand_name, lead_first_name, lead_last_name, lead_email, lead_phone, lead_website,
            description, priority, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', ?, ?)`
        )
        .run(
          requestNumber,
          input.requesterSlackId,
          input.requesterName,
          input.requesterEmail,
          input.requestType,
          JSON.stringify(input.carriers),
          emptyToNull(input.soapboxOption),
          emptyToNull(input.serviceModel),
          emptyToNull(input.sbTier),
          emptyToNull(input.b3plTier),
          input.brandName,
          emptyToNull(input.leadFirstName),
          input.leadLastName,
          emptyToNull(input.leadEmail),
          emptyToNull(input.leadPhone),
          emptyToNull(input.leadWebsite),
          input.description,
          input.priority,
          now,
          now
        );

      const requestId = Number(result.lastInsertRowid);
      const insertFile = this.db.prepare(
        `INSERT INTO request_files (request_id, slack_file_id, file_name, file_type, permalink, uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      for (const file of input.files) {
        insertFile.run(requestId, file.id, file.name, file.filetype ?? null, file.permalink ?? null, file.uploadedAt ?? now);
      }

      this.addActivity({
        requestId,
        action: "created",
        previousStatus: null,
        newStatus: "Open",
        actorSlackId: input.requesterSlackId,
        actorName: input.requesterName,
        notes: null
      });

      const created = this.findById(requestId);
      if (!created) throw new Error("Created request could not be loaded");
      return created;
    })();
  }

  findById(id: number): RateRequest | undefined {
    const row = this.db.prepare("SELECT * FROM rate_requests WHERE id = ?").get(id) as RequestRow | undefined;
    return row ? this.hydrate(row) : undefined;
  }

  findByMessage(channelId: string, messageTs: string): RateRequest | undefined {
    const row = this.db
      .prepare("SELECT * FROM rate_requests WHERE channel_id = ? AND message_ts = ?")
      .get(channelId, messageTs) as RequestRow | undefined;
    return row ? this.hydrate(row) : undefined;
  }

  setMessageLocation(id: number, channelId: string, messageTs: string): RateRequest {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE rate_requests SET channel_id = ?, message_ts = ?, updated_at = ? WHERE id = ?")
      .run(channelId, messageTs, now, id);
    return this.required(id);
  }

  assign(id: number, actorSlackId: string, actorName: string): RateRequest {
    return this.db.transaction(() => {
      const current = this.required(id);
      const now = new Date().toISOString();
      this.db
        .prepare("UPDATE rate_requests SET assigned_slack_id = ?, assigned_name = ?, updated_at = ? WHERE id = ?")
        .run(actorSlackId, actorName, now, id);
      this.addActivity({
        requestId: id,
        action: "assigned",
        previousStatus: current.status,
        newStatus: current.status,
        actorSlackId,
        actorName,
        notes: `Assigned to ${actorName}`
      });
      return this.required(id);
    })();
  }

  updateStatus(
    id: number,
    newStatus: RequestStatus,
    actorSlackId: string,
    actorName: string,
    notes?: string | null
  ): RateRequest {
    return this.db.transaction(() => {
      const current = this.required(id);
      const now = new Date().toISOString();
      const completedAt = newStatus === "Complete" ? now : newStatus === "In Progress" ? null : current.completedAt ?? null;
      this.db
        .prepare("UPDATE rate_requests SET status = ?, updated_at = ?, completed_at = ? WHERE id = ?")
        .run(newStatus, now, completedAt, id);
      this.addActivity({
        requestId: id,
        action: `status:${newStatus}`,
        previousStatus: current.status,
        newStatus,
        actorSlackId,
        actorName,
        notes: notes ?? null
      });
      return this.required(id);
    })();
  }

  setSalesforceRecord(id: number, objectType: string, recordId: string): RateRequest {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE rate_requests SET salesforce_object_type = ?, salesforce_record_id = ?, updated_at = ? WHERE id = ?")
      .run(objectType, recordId, now, id);
    return this.required(id);
  }

  addCompletionFiles(requestId: number, files: SlackFile[]): void {
    const now = new Date().toISOString();
    const insertFile = this.db.prepare(
      `INSERT INTO request_files (request_id, slack_file_id, file_name, file_type, permalink, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    this.db.transaction(() => {
      for (const file of files) {
        insertFile.run(requestId, file.id, file.name, file.filetype ?? null, file.permalink ?? null, file.uploadedAt ?? now);
      }
    })();
  }

  private nextSequence(dateKey: string): number {
    this.db
      .prepare(
        `INSERT INTO request_sequences (request_date, last_sequence)
         VALUES (?, 0)
         ON CONFLICT(request_date) DO NOTHING`
      )
      .run(dateKey);
    this.db.prepare("UPDATE request_sequences SET last_sequence = last_sequence + 1 WHERE request_date = ?").run(dateKey);
    const row = this.db.prepare("SELECT last_sequence FROM request_sequences WHERE request_date = ?").get(dateKey) as {
      last_sequence: number;
    };
    return row.last_sequence;
  }

  private required(id: number): RateRequest {
    const request = this.findById(id);
    if (!request) throw new Error(`Rate request ${id} was not found`);
    return request;
  }

  private hydrate(row: RequestRow): RateRequest {
    const files = this.db
      .prepare("SELECT * FROM request_files WHERE request_id = ? ORDER BY id")
      .all(row.id) as FileRow[];
    const requestType = normalizeRequestType(row.request_type);
    return {
      id: row.id,
      requestNumber: row.request_number,
      requesterSlackId: row.requester_slack_id,
      requesterName: row.requester_name,
      requesterEmail: row.requester_email,
      requestType,
      carriers: requestType === "Soapbox" ? parseCarriers(row.carriers_json) : [],
      soapboxOption: row.soapbox_option && isSoapboxOption(row.soapbox_option) ? row.soapbox_option : null,
      serviceModel: row.service_model && isServiceModel(row.service_model) ? row.service_model : null,
      sbTier: normalizeSbTier(row.sb_tier) ?? null,
      b3plTier: row.b3pl_tier && isB3plTier(row.b3pl_tier) ? row.b3pl_tier : null,
      brandName: row.brand_name,
      leadFirstName: row.lead_first_name,
      leadLastName: row.lead_last_name,
      leadEmail: row.lead_email,
      leadPhone: row.lead_phone,
      leadWebsite: row.lead_website,
      description: row.description,
      priority: row.priority,
      status: row.status,
      assignedSlackId: row.assigned_slack_id,
      assignedName: row.assigned_name,
      channelId: row.channel_id,
      messageTs: row.message_ts,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      salesforceObjectType: row.salesforce_object_type,
      salesforceRecordId: row.salesforce_record_id,
      files: files.map((file) => ({
        id: file.slack_file_id,
        name: file.file_name,
        filetype: file.file_type ?? undefined,
        permalink: file.permalink ?? undefined,
        uploadedAt: file.uploaded_at
      }))
    };
  }

  private addActivity(input: {
    requestId: number;
    action: string;
    previousStatus: RequestStatus | null;
    newStatus: RequestStatus | null;
    actorSlackId: string;
    actorName: string;
    notes: string | null;
  }) {
    this.db
      .prepare(
        `INSERT INTO request_activity (
          request_id, action, previous_status, new_status, actor_slack_id, actor_name, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.requestId,
        input.action,
        input.previousStatus,
        input.newStatus,
        input.actorSlackId,
        input.actorName,
        input.notes,
        new Date().toISOString()
      );
  }
}

function normalizeRequestType(value: string | null): RequestType {
  return value && isRequestType(value) ? value : "Soapbox";
}

function parseCarriers(value: string | null): Carrier[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Carrier => typeof item === "string" && isCarrier(item));
  } catch {
    return [];
  }
}

function emptyToNull(value?: string) {
  return value && value.trim() ? value.trim() : null;
}

function formatDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

