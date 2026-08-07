PRAGMA foreign_keys = ON;

ALTER TABLE rate_requests ADD COLUMN lead_first_name TEXT;
ALTER TABLE rate_requests ADD COLUMN lead_last_name TEXT;
ALTER TABLE rate_requests ADD COLUMN lead_email TEXT;
ALTER TABLE rate_requests ADD COLUMN lead_phone TEXT;
ALTER TABLE rate_requests ADD COLUMN lead_website TEXT;