type DiscordReviewInteraction = {
  channelId: string | null;
  customId: string;
  deferReply: (options: { ephemeral: boolean }) => Promise<unknown>;
  editReply: (message: { content: string }) => Promise<unknown>;
  user: { id: string };
};

const AGENT_REVIEW_PATTERN = /^agent-review:([a-f0-9]{32}):(approve|reject)$/;
const REVIEW_FAILURE =
  'This review could not be completed. It may have expired or you may not be authorized. Please review the content in the app.';

export async function handleDiscordAgentReview(
  client: {
    resolveAgentReportReview: (input: {
      channelId: string;
      decision: 'approve' | 'reject';
      organizationId: string;
      remoteUserId: string;
      token: string;
    }) => Promise<{ message: string }>;
  },
  interaction: DiscordReviewInteraction,
  organizationId: string,
): Promise<boolean> {
  const reviewMatch = interaction.customId.match(AGENT_REVIEW_PATTERN);
  if (!reviewMatch || reviewMatch[0] !== interaction.customId) return false;
  await interaction.deferReply({ ephemeral: true });
  if (!interaction.channelId || !interaction.user.id) {
    await interaction.editReply({ content: REVIEW_FAILURE });
    return true;
  }
  try {
    const result = await client.resolveAgentReportReview({
      channelId: interaction.channelId,
      decision: reviewMatch[2] === 'approve' ? 'approve' : 'reject',
      organizationId,
      remoteUserId: interaction.user.id,
      token: reviewMatch[1] ?? '',
    });
    await interaction.editReply({ content: result.message });
  } catch {
    await interaction.editReply({ content: REVIEW_FAILURE });
  }
  return true;
}

export async function rememberDiscordIntegration<T>(input: {
  apply: (integration: T) => Promise<void>;
  integrationId: string;
  load: () => Promise<T | null | undefined>;
  logError: (error: unknown) => void;
  warn: (message: string) => void;
}): Promise<void> {
  try {
    const integration = await input.load();
    if (!integration) {
      input.warn(
        `Unable to normalize Discord integration payload: ${input.integrationId}`,
      );
      return;
    }
    await input.apply(integration);
  } catch (error) {
    input.logError(error);
  }
}

export async function loadDiscordOrgWorkflows<T>(input: {
  load: () => Promise<T[]>;
  logError: (error: unknown) => void;
}): Promise<T[]> {
  try {
    return await input.load();
  } catch (error) {
    input.logError(error);
    return [];
  }
}
