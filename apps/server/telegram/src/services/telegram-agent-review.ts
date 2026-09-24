const AGENT_REVIEW_PATTERN = /^agent-review:([a-f0-9]{32}):(approve|reject)$/;
const REVIEW_FAILURE =
  'This review could not be completed. It may have expired or you may not be authorized. Please review the content in the app.';

type TelegramReviewContext = {
  answerCallbackQuery: () => Promise<unknown>;
  callbackQuery?: { data?: string };
  chat?: { id?: number | string };
  from?: { id?: number | string };
  reply: (message: string) => Promise<unknown>;
};

export async function handleTelegramAgentReview(
  client: {
    resolveAgentReportReview: (input: {
      channelId: string;
      decision: 'approve' | 'reject';
      organizationId: string;
      remoteUserId: string;
      token: string;
    }) => Promise<{ message: string }>;
  },
  ctx: TelegramReviewContext,
  organizationId: string,
): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  const reviewMatch = data?.match(AGENT_REVIEW_PATTERN);
  if (!reviewMatch || reviewMatch[0] !== data) return false;
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id?.toString();
  const remoteUserId = ctx.from?.id?.toString();
  if (!chatId || !remoteUserId) {
    await ctx.reply(REVIEW_FAILURE);
    return true;
  }
  try {
    const result = await client.resolveAgentReportReview({
      channelId: chatId,
      decision: reviewMatch[2] === 'approve' ? 'approve' : 'reject',
      organizationId,
      remoteUserId,
      token: reviewMatch[1] ?? '',
    });
    await ctx.reply(result.message);
  } catch {
    await ctx.reply(REVIEW_FAILURE);
  }
  return true;
}

type TelegramWorkflowOutput = {
  caption?: string;
  text?: string;
  type?: string;
  url?: string;
};

export async function presentTelegramWorkflowOutputs(
  ctx: {
    reply: (message: string) => Promise<unknown>;
    replyWithPhoto: (
      url: string,
      extra: { caption: string },
    ) => Promise<unknown>;
    replyWithVideo: (
      url: string,
      extra: { caption: string },
    ) => Promise<unknown>;
  },
  outputs: TelegramWorkflowOutput[],
): Promise<void> {
  if (outputs.length === 0) {
    await ctx.reply('Workflow completed successfully.');
    return;
  }
  for (const output of outputs) {
    if (output.type === 'image' && output.url) {
      await ctx.replyWithPhoto(output.url, {
        caption: output.caption || 'Generated image',
      });
    } else if (output.type === 'video' && output.url) {
      await ctx.replyWithVideo(output.url, {
        caption: output.caption || 'Generated video',
      });
    } else if (output.text) {
      await ctx.reply(output.text);
    } else if (output.url) {
      await ctx.reply(output.url);
    }
  }
}
