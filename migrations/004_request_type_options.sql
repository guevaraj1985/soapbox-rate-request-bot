PRAGMA foreign_keys = ON;

ALTER TABLE rate_requests ADD COLUMN request_type TEXT NOT NULL DEFAULT 'Soapbox';
ALTER TABLE rate_requests ADD COLUMN carriers_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE rate_requests ADD COLUMN service_model TEXT;
ALTER TABLE rate_requests ADD COLUMN sb_tier TEXT;
ALTER TABLE rate_requests ADD COLUMN b3pl_tier TEXT;
