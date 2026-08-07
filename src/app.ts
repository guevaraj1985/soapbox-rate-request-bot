import { App } from "@slack/bolt";
import { config } from "./config.js";
import { RateRequestRepository } from "./db/rateRequestRepository.js";
import { registerRateRequestHandlers } from "./handlers/rateRequestHandlers.js";

export function createSlackApp(repo: RateRequestRepository) {
  const app = new App({
    token: config.SLACK_BOT_TOKEN,
    signingSecret: config.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: config.SLACK_APP_TOKEN
  });

  registerRateRequestHandlers(app, repo);
  return app;
}
