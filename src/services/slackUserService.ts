import type { WebClient } from "@slack/web-api";

export type SlackUserProfile = {
  id: string;
  name: string;
  email: string;
};

export async function getSlackUserProfile(client: WebClient, userId: string): Promise<SlackUserProfile> {
  const response = await client.users.info({ user: userId, include_locale: false });
  if (!response.user) throw new Error(`Slack user ${userId} was not returned`);

  const profile = response.user.profile;
  const name =
    profile?.display_name_normalized ||
    profile?.display_name ||
    profile?.real_name_normalized ||
    profile?.real_name ||
    response.user.name ||
    userId;
  const email = profile?.email;
  if (!email) throw new Error(`Slack user ${userId} does not have an email visible to this app`);

  return { id: userId, name, email };
}

export async function openDirectMessage(client: WebClient, userId: string): Promise<string> {
  const response = await client.conversations.open({ users: userId });
  const channelId = response.channel?.id;
  if (!channelId) throw new Error(`Could not open DM with ${userId}`);
  return channelId;
}
