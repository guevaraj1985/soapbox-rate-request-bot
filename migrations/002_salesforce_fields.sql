PRAGMA foreign_keys = ON;

ALTER TABLE rate_requests ADD COLUMN salesforce_object_type TEXT;
ALTER TABLE rate_requests ADD COLUMN salesforce_record_id TEXT;