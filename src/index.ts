import { createSlackApp } from "./app.js";
import { RateRequestRepository } from "./db/rateRequestRepository.js";
import { runMigrations } from "./db/migrate.js";
import { logger } from "./utils/logger.js";

const db = runMigrations();
const repo = new RateRequestRepository(db);
const app = createSlackApp(repo);

await app.start();
logger.info("Soapbox Rate Request Bot is running in Socket Mode");
