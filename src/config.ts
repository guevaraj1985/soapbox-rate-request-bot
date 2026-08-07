import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.string().url().optional());
const optionalPath = z.preprocess((value) => (value === "" ? undefined : value), z.string().optional());
const optionalString = z.preprocess((value) => (value === "" ? undefined : value), z.string().optional());

const envSchema = z.object({
  SLACK_BOT_TOKEN: z.string().min(1),
  SLACK_APP_TOKEN: z.string().min(1),
  SLACK_SIGNING_SECRET: z.string().min(1),
  RATE_REQUEST_CHANNEL_ID: z.string().default("C08071S2P8E"),
  RATE_REQUEST_TEMPLATE_URL: optionalUrl,
  RATE_REQUEST_TEMPLATE_FILE_PATH: optionalPath,
  SALESFORCE_ENABLED: z.preprocess((value) => value === "true", z.boolean()).default(false),
  SALESFORCE_DRY_RUN: z.preprocess((value) => value === "true", z.boolean()).default(false),
  SALESFORCE_ATTACH_FILES: z.preprocess((value) => value === "true", z.boolean()).default(true),
  SALESFORCE_LOGIN_URL: optionalUrl.default("https://login.salesforce.com"),
  SALESFORCE_CLIENT_ID: optionalString,
  SALESFORCE_CLIENT_SECRET: optionalString,
  SALESFORCE_OBJECT_TYPE: z.enum(["Lead", "Opportunity"]).default("Lead"),
  SALESFORCE_API_VERSION: z.string().default("v61.0"),
  SALESFORCE_LEAD_STATUS: z.string().default("Open - Not Contacted"),
  SALESFORCE_LEAD_SOURCE: z.string().default("Slack Rate Request Form"),
  SALESFORCE_B3PL_LEAD_SOURCE: z.string().default("B3PL Slack Rate Request Form"),
  SALESFORCE_LEAD_TYPE: z.string().default("Shipper (Brand)"),
  SALESFORCE_OPPORTUNITY_STAGE: z.string().default("Prospecting"),
  SALESFORCE_OPPORTUNITY_CLOSE_DAYS: z.coerce.number().int().positive().default(30),
  DATABASE_PATH: z.string().default("./data/rate-requests.sqlite")
});

export const config = envSchema.parse(process.env);

