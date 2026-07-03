import type {
  SocialActionParams,
  SocialConversationListParams,
} from '@mcp/services/client/social-messages.client';
import type { ClientService } from '@mcp/services/client.service';

export const SOCIAL_MESSAGES_TOOL_NAMES = new Set([
  'list_social_conversations',
  'get_social_conversation',
  'create_social_reply_draft',
  'approve_social_draft',
  'reject_social_draft',
  'post_social_reply',
  'send_social_dm',
  'tag_social_conversation',
  'assign_social_conversation',
  'mark_social_conversation_resolved',
]);

export function handleSocialMessagesTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  const handlers: Record<
    string,
    (
      args: Record<string, unknown>,
    ) => Promise<{ content: Array<{ text: string; type: 'text' }> }>
  > = {
    approve_social_draft: async (a) => {
      const result = await client.approveSocialDraft(
        requiredString(a, 'conversationId'),
        requiredString(a, 'messageId'),
      );

      return textJsonResult('Approved and published social draft', result);
    },
    assign_social_conversation: async (a) => {
      const result = await client.assignSocialConversation(
        requiredString(a, 'conversationId'),
        optionalNullableString(a, 'assignedOwnerId'),
      );

      return textJsonResult('Updated social conversation assignment', result);
    },
    create_social_reply_draft: async (a) => {
      const result = await client.createSocialReplyDraft(
        requiredString(a, 'conversationId'),
        socialActionParams(a),
      );

      return textJsonResult('Created social reply draft', result);
    },
    get_social_conversation: async (a) => {
      const result = await client.getSocialConversation(
        requiredString(a, 'conversationId'),
        {
          includeMessages: optionalBoolean(a, 'includeMessages') ?? true,
          limit: optionalNumber(a, 'limit'),
        },
      );

      return textJsonResult('Social conversation', result);
    },
    list_social_conversations: async (a) => {
      const result = await client.listSocialConversations(listParams(a));

      return {
        content: [
          {
            text:
              result.conversations.length > 0
                ? `Found ${result.conversations.length} social conversations:\n\n${JSON.stringify(result, null, 2)}`
                : 'No social conversations found.',
            type: 'text' as const,
          },
        ],
      };
    },
    mark_social_conversation_resolved: async (a) => {
      const result = await client.markSocialConversationResolved(
        requiredString(a, 'conversationId'),
      );

      return textJsonResult('Marked social conversation resolved', result);
    },
    post_social_reply: async (a) => {
      const result = await client.postSocialReply(
        requiredString(a, 'conversationId'),
        socialActionParams(a),
      );

      return textJsonResult('Published social reply', result);
    },
    reject_social_draft: async (a) => {
      const result = await client.rejectSocialDraft(
        requiredString(a, 'conversationId'),
        requiredString(a, 'messageId'),
        optionalString(a, 'reason'),
      );

      return textJsonResult('Rejected social draft', result);
    },
    send_social_dm: async (a) => {
      const result = await client.sendSocialDm(
        requiredString(a, 'conversationId'),
        socialActionParams(a),
      );

      return textJsonResult('Sent social DM', result);
    },
    tag_social_conversation: async (a) => {
      const result = await client.updateSocialTags(
        requiredString(a, 'conversationId'),
        requiredStringArray(a, 'tags'),
      );

      return textJsonResult('Updated social conversation tags', result);
    },
  };

  const handler = handlers[name];
  if (!handler) throw new Error(`Unknown social messages tool: ${name}`);
  return handler(args);
}

function listParams(
  args: Record<string, unknown>,
): SocialConversationListParams {
  return {
    assignedOwnerId: optionalString(args, 'assignedOwnerId'),
    automationState: optionalString(args, 'automationState'),
    conversationType: optionalString(args, 'conversationType'),
    credentialId: optionalString(args, 'credentialId'),
    limit: optionalNumber(args, 'limit'),
    needsReview: optionalBoolean(args, 'needsReview'),
    page: optionalNumber(args, 'page'),
    platform: optionalString(args, 'platform'),
    search: optionalString(args, 'search'),
    status: optionalString(args, 'status'),
    tag: optionalString(args, 'tag'),
    unread: optionalBoolean(args, 'unread'),
  };
}

function socialActionParams(args: Record<string, unknown>): SocialActionParams {
  const messageType = optionalString(args, 'messageType');
  if (messageType && messageType !== 'dm' && messageType !== 'reply') {
    throw new Error('messageType must be "reply" or "dm"');
  }
  const normalizedMessageType = messageType as 'dm' | 'reply' | undefined;

  return {
    agentRunId: optionalString(args, 'agentRunId'),
    idempotencyKey: optionalString(args, 'idempotencyKey'),
    messageType: normalizedMessageType,
    recipientId: optionalString(args, 'recipientId'),
    text: requiredString(args, 'text'),
    workflowRunId: optionalString(args, 'workflowRunId'),
  };
}

function textJsonResult(label: string, data: unknown) {
  return {
    content: [
      {
        text: `${label}:\n\n${JSON.stringify(data, null, 2)}`,
        type: 'text' as const,
      },
    ],
  };
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function optionalString(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

function optionalNullableString(
  args: Record<string, unknown>,
  key: string,
): string | null | undefined {
  if (args[key] === null) {
    return null;
  }
  return optionalString(args, key);
}

function optionalNumber(
  args: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = args[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function optionalBoolean(
  args: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = args[key];
  return typeof value === 'boolean' ? value : undefined;
}

function requiredStringArray(
  args: Record<string, unknown>,
  key: string,
): string[] {
  const value = args[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${key} must be an array of strings`);
  }

  return value.map((item) => item.trim()).filter(Boolean);
}
