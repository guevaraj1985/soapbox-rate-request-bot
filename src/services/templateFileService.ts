import fs from "node:fs";
import path from "node:path";
import type { WebClient } from "@slack/web-api";
import { openDirectMessage } from "./slackUserService.js";

export async function sendTemplateFileToRequester(client: WebClient, userId: string, templateFilePath: string) {
  if (!fs.existsSync(templateFilePath)) {
    throw new Error(`Template file does not exist: ${templateFilePath}`);
  }

  const stats = fs.statSync(templateFilePath);
  if (!stats.isFile()) {
    throw new Error(`Template path is not a file: ${templateFilePath}`);
  }

  const channelId = await openDirectMessage(client, userId);
  const filename = path.basename(templateFilePath);

  await client.filesUploadV2({
    channel_id: channelId,
    file: fs.createReadStream(templateFilePath),
    filename,
    title: filename,
    initial_comment:
      "Here is the shipment template for your rate request. Complete and attach it when shipment-level data is required. Add SKU data on Sheet 1 and order data on Sheet 2."
  });
}