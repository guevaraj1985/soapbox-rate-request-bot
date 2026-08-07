# Soapbox Rate Request Bot

A basic internal Slack app for collecting, tracking, and updating Soapbox rate requests. It uses Node.js, TypeScript, Slack Bolt, Socket Mode, and SQLite.

## What It Does

- Provides `/rate-request` as the intake command.
- Opens a Slack modal with requester profile context, a Soapbox/B3PL request type selector, conditional request options, required Salesforce Lead fields, conditional service/tier options, description, and optional attachments.
- Uses optional Block Kit `file_input` for attachments. The app does not call deprecated `files.upload`.
- Can show an on-demand `Send Template` button that DMs a local shipment template file only when the requester clicks it.
- Generates request IDs as `RR-YYYYMMDD-####` using a SQLite transaction-backed sequence table.
- Posts a parent request message to the configured rate request channel.
- Adds thread updates, requester DMs, assignment, status transitions, cancellation, needs-information notes, and completion summaries.
- Optionally creates or links a Salesforce Lead or Opportunity for each submitted request. For Leads, the prospect/company from the modal becomes the Lead; the Soapbox employee requester is kept as context only. The bot can also copy submitted Slack files to the Salesforce record as Salesforce Files. When a request is completed, the completion summary is added as a Salesforce Note and completion attachments are copied as Salesforce Files.

## Slack App Setup

1. Create a Slack app at https://api.slack.com/apps.
2. Import `slack-app-manifest.yml` into the app manifest editor.
3. Create an app-level token with the `connections:write` scope and use it as `SLACK_APP_TOKEN`.
4. Install the app to the workspace.
5. Invite the bot to the rate request channel.
6. Confirm the slash command is `/rate-request`.
7. Keep Socket Mode enabled for local development.

## Required OAuth Scopes

The manifest includes the minimum bot scopes used by this app:

- `commands` for slash commands.
- `chat:write` for posting and updating messages.
- `users:read` for requester and actor names.
- `users:read.email` for requester email addresses.
- `files:read` for files submitted through Block Kit `file_input`.
- `files:write` for sending the shipment template file to requesters when `RATE_REQUEST_TEMPLATE_FILE_PATH` is configured.
- `im:write` for requester direct messages.
- `channels:read` for channel message permalink lookup.
- `channels:history` for Salesforce completion-note thread recaps.

## Environment Variables

Copy `.env.example` to `.env` and fill in real values:

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-level-token
SLACK_SIGNING_SECRET=your-signing-secret
RATE_REQUEST_CHANNEL_ID=C08071S2P8E
RATE_REQUEST_TEMPLATE_URL=
RATE_REQUEST_TEMPLATE_FILE_PATH=./templates/Data Request Template.xlsx
DATABASE_PATH=./data/rate-requests.sqlite
```

Do not hardcode Slack tokens, user IDs, email addresses, or template URLs in source code.

## Shipment Template

You have two supported options:

1. Hosted template link: set `RATE_REQUEST_TEMPLATE_URL` to a shared download URL. The modal will show a `Download Template` button.
2. Local template attachment: save the template file inside the project, for example `templates/Data Request Template.xlsx`, then set `RATE_REQUEST_TEMPLATE_FILE_PATH=./templates/Data Request Template.xlsx`. The modal will show a `Send Template` button, and the bot will DM the file only when the requester clicks that button.

For the local attachment option, add `files:write` to the Slack app OAuth scopes, reinstall the app to the workspace, and restart the bot. This uses Slack's current external upload flow through `filesUploadV2`; it does not use deprecated `files.upload`.

## Salesforce Integration

Salesforce is optional. Leave `SALESFORCE_ENABLED=false` while testing Slack-only behavior.

To turn it on, create a Salesforce connected app or external client app that supports the OAuth 2.0 client credentials flow. Assign an integration user with permission to create the target object, then set:

```bash
SALESFORCE_ENABLED=true
SALESFORCE_LOGIN_URL=https://login.salesforce.com
SALESFORCE_CLIENT_ID=your-salesforce-client-id
SALESFORCE_CLIENT_SECRET=your-salesforce-client-secret
SALESFORCE_OBJECT_TYPE=Lead
SALESFORCE_API_VERSION=v61.0
```

Use `SALESFORCE_LOGIN_URL=https://test.salesforce.com` for a sandbox.

Supported `SALESFORCE_OBJECT_TYPE` values:

- `Lead`: creates a Lead where `Company` is the Brand / Company Name, `FirstName` and `LastName` are parsed from Lead Contact Name, and `Email` comes from the required Lead Contact Email field; `Phone` and `Website` come from optional Lead Contact fields in `/rate-request`. It also sends `Status`, `LeadSource`, `Type__c`, `Nature_of_Interest__c` as the Slack rate request ID, `message__c`, `Description`, and `Slack_Thread_ID__c`. The Slack requester is included in `Description`, but is not used as the Lead identity. The bot does not send the visible `Metadata__c` JSON blob.
- `Opportunity`: creates an Opportunity with `Name`, `StageName`, `CloseDate`, and `Description`.

Optional defaults:

```bash
SALESFORCE_LEAD_STATUS=Open - Not Contacted
SALESFORCE_LEAD_SOURCE=Slack Rate Request Form
SALESFORCE_B3PL_LEAD_SOURCE=B3PL Slack Rate Request Form
SALESFORCE_LEAD_TYPE=Shipper (Brand)
SALESFORCE_ATTACH_FILES=true
SALESFORCE_OPPORTUNITY_STAGE=Prospecting
SALESFORCE_OPPORTUNITY_CLOSE_DAYS=30
```

Use `SALESFORCE_DRY_RUN=true` to post the Salesforce payload in the Slack thread without creating a record. Set it to `false` when you are ready to create real Salesforce records. Before creating a Lead, the bot checks for existing Salesforce records in this order: Lead by `Slack_Thread_ID__c`, unconverted Lead by exact `Email`, unconverted Lead by exact contact name, unconverted Lead by exact `Company`, then open Opportunity by matching `Opportunity.Account.Name`, `Opportunity.Name`, or the prospect name in `Opportunity.Name`. If it finds one, it links the request to that Salesforce record instead of creating another Lead. When `SALESFORCE_ATTACH_FILES=true`, submitted Slack files are copied to the Salesforce record as Files after the record is created or linked.

If Salesforce creation succeeds, the bot stores the Salesforce object type and record ID on the rate request, refreshes the parent Slack message, and posts a thread link to the record. If Salesforce fails, the Slack request still stays open and the error is posted in the request thread. When a linked request is marked complete and dry-run is off, Salesforce receives a concise completion Note with the request ID, selected tier, Slack thread permalink, final notes, a best-effort Slack thread recap, and final file links. Completion files are also sent to Salesforce Files.

## Local Development

```bash
pnpm install
pnpm run migrate
pnpm run dev
```

Then run `/rate-request` in Slack.

## Testing

```bash
pnpm test
pnpm run lint
```

## Production Build

```bash
pnpm run build
pnpm start
```

## Developer Handoff

For AWS hosting, Salesforce permissions, deployment steps, and production-readiness notes, see [`docs/developer-handoff.md`](docs/developer-handoff.md).

## Docker

```bash
docker build -t soapbox-rate-request-bot .
docker run --env-file .env soapbox-rate-request-bot
```

Mount a persistent volume for the SQLite path in production, for example `/app/data` if `DATABASE_PATH=/app/data/rate-requests.sqlite`.

## Notes

- The documented initial channel is `C08071S2P8E`, but deployments should set `RATE_REQUEST_CHANNEL_ID` explicitly.
- Request attachments are optional. `file_input` supports up to 10 files and requires the `files:read` scope when files are submitted.
- Completion result files are collected through a second optional `file_input` in the completion modal.
- The completion summary becomes a concise Salesforce Note on the linked Lead, and completion result files become Salesforce Files on that record when Salesforce sync is live. The Slack thread recap uses `conversations.replies`, so the app must be reinstalled after adding `channels:history`.
- Active requests show assignment and workflow buttons. `Reassign` opens a Slack user picker so the request can be assigned to any Slack user. After a request is marked complete, the parent Slack message hides all workflow buttons except `Reopen Request`; reopening moves the same request back to `In Progress` and restores the active buttons.
- The `/rate-request` modal starts with Request Type. Soapbox shows carrier checkboxes, service model options `Soapbox Shipping Rates`, `WMS OR API`, and `Basic3PL`, plus Soapbox tiers: 3PL Partner (T0) - FedEx 5% / UPS 5% / USPS 0%, Marketplace (T1) - FedEx 10% / UPS 10% / USPS 1%, Reseller (T2) - FedEx 15% / UPS 15% / USPS 2%, Enterprise (T3) - FedEx 20% / UPS 20% / USPS 3%, MM (T4) - FedEx 25% / UPS 25% / USPS 4%, and SMB (T5) - FedEx 30% / UPS 30% / USPS 5%. B3PL shows the B3PL tier/uplift table options. T0-T2 Soapbox selections post an approval notice tagging Laura, Danny, and O in the request thread. The modal requires Brand / Company Name, Lead Contact Name, Lead Contact Email, and Request Description. Attachments are optional. The bot splits the Lead Contact Name into Salesforce `FirstName` and `LastName`; a single-word value such as `Unknown` is sent as `LastName`. Phone and website are optional.
- This version intentionally does not include rate-engine calculations.


















