PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS rate_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_number TEXT NOT NULL UNIQUE,
  requester_slack_id TEXT NOT NULL,
  requester_name TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  request_type TEXT NOT NULL DEFAULT 'Soapbox',
  carriers_json TEXT NOT NULL DEFAULT '[]',
  service_model TEXT,
  sb_tier TEXT,
  b3pl_tier TEXT,
  brand_name TEXT NOT NULL,
  lead_first_name TEXT,
  lead_last_name TEXT,
  lead_email TEXT,
  lead_phone TEXT,
  lead_website TEXT,
  description TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  assigned_slack_id TEXT,
  assigned_name TEXT,
  channel_id TEXT,
  message_ts TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  salesforce_object_type TEXT,
  salesforce_record_id TEXT
);

CREATE TABLE IF NOT EXISTS request_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  slack_file_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  permalink TEXT,
  uploaded_at TEXT NOT NULL,
  FOREIGN KEY (request_id) REFERENCES rate_requests(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS request_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  actor_slack_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (request_id) REFERENCES rate_requests(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS request_sequences (
  request_date TEXT PRIMARY KEY,
  last_sequence INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_requests_status ON rate_requests(status);
CREATE INDEX IF NOT EXISTS idx_rate_requests_message ON rate_requests(channel_id, message_ts);
CREATE INDEX IF NOT EXISTS idx_request_files_request_id ON request_files(request_id);
CREATE INDEX IF NOT EXISTS idx_request_activity_request_id ON request_activity(request_id);

