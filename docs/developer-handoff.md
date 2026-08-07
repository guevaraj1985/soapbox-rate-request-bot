# Soapbox Rate Request Bot Developer Handoff

This document is intended for the engineering team that will host the bot on Soapbox infrastructure, likely AWS. Keep this file updated as the production deployment choices become final.

## Current Architecture

- Node.js TypeScript app using Slack Bolt in Socket Mode.
- SQLite stores rate requests, request type, conditional Soapbox/B3PL options, request numbering, Slack message locations, Salesforce record IDs, status history, and completion files.
- Salesforce integration uses OAuth client credentials and REST APIs.
- Slack files are downloaded with the bot token and copied into Salesforce Files when file sync is enabled.
- Completion text is written to Salesforce Notes. Completion attachments are uploaded as Salesforce Files.

Because the app uses Slack Socket Mode, it maintains a long-running WebSocket connection. It is better suited to ECS/Fargate, EC2, or App Runner than Lambda.

## Runtime Commands

Use Node 20+ and pnpm.

```bash
pnpm install --frozen-lockfile
pnpm run migrate
pnpm run build
pnpm start
```

For local development:

```bash
pnpm run dev
```

Validation before deploy:

```bash
pnpm test
pnpm run build
```

## AWS Hosting Notes

Recommended first production path:

- Package the existing `Dockerfile`.
- Run one ECS Fargate service task for the bot process.
- Store secrets in AWS Secrets Manager or SSM Parameter Store, not in `.env`.
- Send stdout/stderr to CloudWatch Logs.
- Configure the task/service restart policy so the bot reconnects if the process exits.

Database decision:

- If keeping SQLite, mount persistent storage and set `DATABASE_PATH` to that mounted path.
- Do not run multiple bot replicas against the same SQLite file unless the storage and locking behavior have been explicitly validated.
- For high availability or multiple replicas, move persistence to RDS/Postgres and update the repository layer.

Health checks:

- The app does not currently expose an HTTP health endpoint because Slack Socket Mode is the only runtime interface.
- ECS can initially rely on process health.
- If the platform requires an HTTP health check, add a small `/healthz` server that verifies the process is alive and the database can be opened.

## Required Environment

Set these as managed secrets or task environment variables:

```bash
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=
SLACK_SIGNING_SECRET=
RATE_REQUEST_CHANNEL_ID=
RATE_REQUEST_TEMPLATE_URL=https://soapboxinc.slack.com/files/ULLE6BL3E/F0BLMUC009E/data_request_template.xlsx
RATE_REQUEST_TEMPLATE_FILE_PATH=./templates/Data Request Template.xlsx
DATABASE_PATH=

SALESFORCE_ENABLED=
SALESFORCE_DRY_RUN=
SALESFORCE_ATTACH_FILES=
SALESFORCE_LOGIN_URL=
SALESFORCE_CLIENT_ID=
SALESFORCE_CLIENT_SECRET=
SALESFORCE_OBJECT_TYPE=Lead
SALESFORCE_API_VERSION=v61.0
SALESFORCE_LEAD_STATUS=Open - Not Contacted
SALESFORCE_LEAD_SOURCE=Slack Rate Request Form
SALESFORCE_B3PL_LEAD_SOURCE=B3PL Slack Rate Request Form
SALESFORCE_LEAD_TYPE=Shipper (Brand)
SALESFORCE_OPPORTUNITY_STAGE=Prospecting
SALESFORCE_OPPORTUNITY_CLOSE_DAYS=30
```

Template handling:

- `RATE_REQUEST_TEMPLATE_URL` is the primary requester-facing template source. The current value points to the Slack-hosted `data_request_template.xlsx` file that all intended users can access.
- `RATE_REQUEST_TEMPLATE_FILE_PATH` is kept as a backup for hosted deployments. The repo includes `templates/Data Request Template.xlsx`; if the hosted URL is removed later, the bot can DM that file on demand instead.

Production should usually start with:

```bash
SALESFORCE_ENABLED=true
SALESFORCE_DRY_RUN=true
```

Flip `SALESFORCE_DRY_RUN=false` only after the Slack request flow, Salesforce duplicate checks, file upload, and completion-note flow have been validated in the target org.

## Slack Configuration

The Slack app should have:

- Socket Mode enabled.
- App-level token with `connections:write`.
- Slash command `/rate-request`.
- Bot invited to `RATE_REQUEST_CHANNEL_ID`.
- Bot scopes from `slack-app-manifest.yml`.

Scopes currently used:

- `commands`
- `chat:write`
- `users:read`
- `users:read.email`
- `files:read`
- `files:write`
- `im:write`
- `channels:read`
- `channels:history`

If the manifest changes, reinstall the Slack app to the workspace and restart the running service.

## Salesforce Configuration

The integration is currently designed to create or link Leads.

Required connected app / external client app setup:

- OAuth 2.0 client credentials flow enabled.
- Valid execution user selected for the client credentials flow.
- Integration user has object and field permissions for Lead, Opportunity query checks, Salesforce Files, and Notes.

Lead fields sent:

- `Company`
- `FirstName`
- `LastName`
- `Email`
- `Phone`
- `Website`
- `Status`
- `LeadSource`
- `Type__c`
- `Nature_of_Interest__c`
- `message__c`
- `Description`
- `Slack_Thread_ID__c`

Current business mapping:

- `Company` is the prospect brand/company from the Slack modal.
- `FirstName` and `LastName` come from the Lead Contact Name field.
- `Email` is required in the Slack modal and sent to Salesforce.
- The Soapbox employee who submits the request is stored in `Description` only.
- `LeadSource` is `Slack Rate Request Form` for Soapbox requests and `B3PL Slack Rate Request Form` for B3PL requests.
- `Nature_of_Interest__c` is the Slack rate request ID, for example `RR-20260805-0001`.
- Soapbox requests include carrier selections, service model, and Soapbox tier in `Description`.
- B3PL requests include the selected B3PL tier and uplift details in `Description`.
- `Metadata__c` is intentionally not sent.

Duplicate/linking behavior before creating a Lead:

- Checks Lead by `Slack_Thread_ID__c`.
- Checks unconverted Lead by exact `Email`.
- Checks unconverted Lead by exact `FirstName` and `LastName`, or `LastName` when only one name is provided.
- Checks unconverted Lead by exact `Company`.
- Checks open Opportunity by exact `Opportunity.Account.Name`, partial `Opportunity.Name`, or the prospect name in `Opportunity.Name`.
- If a match is found, the request links to that Salesforce record instead of creating a new Lead.

Files and notes:

- Initial Slack attachments are copied to Salesforce Files when `SALESFORCE_ATTACH_FILES=true`.
- Completion modal text is created as a Salesforce Note with the request ID, selected tier, Slack thread permalink, final notes, final file links, and a best-effort Slack thread recap from `conversations.replies`.
- Completion modal attachments are copied to Salesforce Files.

Salesforce fields and picklists that must exist:

- `Slack_Thread_ID__c` on Lead.
- `message__c` on Lead.
- `Type__c` picklist value used by `SALESFORCE_LEAD_TYPE`.
- `LeadSource` picklist values `Slack Rate Request Form` and `B3PL Slack Rate Request Form`.
- `Nature_of_Interest__c` must accept the rate request ID text.

## Deployment Checklist

Before production cutover:

- Confirm `.env` secrets are moved to AWS-managed secrets.
- Confirm `DATABASE_PATH` points to persistent storage or the app has been migrated to RDS.
- Run all migrations against the production database path.
- Run `pnpm test` and `pnpm run build`.
- Deploy with `SALESFORCE_DRY_RUN=true`.
- Submit one Slack test request with and without an attachment.
- Confirm Slack parent message, thread updates, requester DM, assignment picker, completion, and reopen behavior.
- Confirm Salesforce dry-run payload has the expected Lead fields.
- Switch `SALESFORCE_DRY_RUN=false`.
- Submit one controlled live request and verify Lead link/create behavior.
- Complete that request and verify Salesforce Note plus Files.
- Document the production Slack channel, AWS service name, AWS region, CloudWatch log group, database backup process, and rollback process.

## Known Follow-Ups

- Add an HTTP `/healthz` endpoint if the selected AWS service requires one.
- Decide whether SQLite remains acceptable for production or whether the repository should move to Postgres/RDS.
- Add a deployment pipeline once the AWS target is chosen.
- Add alerting for Slack connection failures, Salesforce auth failures, and repeated Salesforce sync failures.
- If the business later wants Opportunities instead of Leads, define the required Account matching/creation rule before enabling Opportunity creation.

## Request-type fields persisted

- `request_type`: `Soapbox` or `B3PL`.
- `carriers_json`: selected Soapbox carriers.
- `service_model`: Soapbox service model. Current values are `Soapbox Shipping Rates`, `WMS OR API`, and `Basic3PL`.
- `sb_tier`: Soapbox tier. Current dropdown values are `3PL Partner (T0) - FedEx 5% / UPS 5% / USPS 0%`, `Marketplace (T1) - FedEx 10% / UPS 10% / USPS 1%`, `Reseller (T2) - FedEx 15% / UPS 15% / USPS 2%`, `Enterprise (T3) - FedEx 20% / UPS 20% / USPS 3%`, `MM (T4) - FedEx 25% / UPS 25% / USPS 4%`, and `SMB (T5) - FedEx 30% / UPS 30% / USPS 5%`. T0-T2 selections post an approval notice tagging <@U0693PQ6H89>, <@UK2F5L0HH>, and <@U068N11K7SM>.
- `b3pl_tier`: B3PL tier/uplift option.





