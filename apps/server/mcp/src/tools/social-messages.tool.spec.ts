import type { ClientService } from '@mcp/services/client.service';
import {
  handleSocialMessagesTool,
  SOCIAL_MESSAGES_TOOL_NAMES,
} from '@mcp/tools/social-messages.tool';

function buildClient() {
  return {
    approveSocialDraft: vi
      .fn()
      .mockResolvedValue({ id: 'message-1', status: 'PUBLISHED' }),
    assignSocialConversation: vi
      .fn()
      .mockResolvedValue({ assignedOwnerId: 'user-1', id: 'conversation-1' }),
    createSocialReplyDraft: vi
      .fn()
      .mockResolvedValue({ id: 'message-1', status: 'DRAFT' }),
    getSocialConversation: vi
      .fn()
      .mockResolvedValue({ id: 'conversation-1', messages: [] }),
    listSocialConversations: vi
      .fn()
      .mockResolvedValue({ conversations: [{ id: 'conversation-1' }] }),
    markSocialConversationResolved: vi
      .fn()
      .mockResolvedValue({ id: 'conversation-1', status: 'RESOLVED' }),
    postSocialReply: vi
      .fn()
      .mockResolvedValue({ id: 'message-2', status: 'PUBLISHED' }),
    rejectSocialDraft: vi
      .fn()
      .mockResolvedValue({ id: 'message-1', status: 'REJECTED' }),
    sendSocialDm: vi
      .fn()
      .mockResolvedValue({ id: 'message-3', status: 'SENT' }),
    updateSocialTags: vi
      .fn()
      .mockResolvedValue({ id: 'conversation-1', tags: ['vip'] }),
  };
}

function call(
  client: ReturnType<typeof buildClient>,
  name: string,
  args: Record<string, unknown>,
) {
  return handleSocialMessagesTool(
    client as unknown as ClientService,
    name,
    args,
  );
}

describe('SOCIAL_MESSAGES_TOOL_NAMES', () => {
  it('routes every advertised name to a handler', async () => {
    const baseArgs: Record<string, unknown> = {
      conversationId: 'conversation-1',
      messageId: 'message-1',
      tags: ['vip'],
      text: 'hello',
    };

    for (const name of SOCIAL_MESSAGES_TOOL_NAMES) {
      const client = buildClient();
      await expect(call(client, name, baseArgs)).resolves.toBeDefined();
    }
  });
});

describe('handleSocialMessagesTool — listing', () => {
  it('passes every supported filter through to the client', async () => {
    const client = buildClient();

    const result = await call(client, 'list_social_conversations', {
      assignedOwnerId: 'user-1',
      automationState: 'PAUSED',
      conversationType: 'dm',
      credentialId: 'credential-1',
      limit: 25,
      needsReview: true,
      page: 2,
      platform: 'instagram',
      search: 'refund',
      status: 'OPEN',
      tag: 'vip',
      unread: false,
    });

    expect(client.listSocialConversations).toHaveBeenCalledWith({
      assignedOwnerId: 'user-1',
      automationState: 'PAUSED',
      conversationType: 'dm',
      credentialId: 'credential-1',
      limit: 25,
      needsReview: true,
      page: 2,
      platform: 'instagram',
      search: 'refund',
      status: 'OPEN',
      tag: 'vip',
      unread: false,
    });
    expect(result.content[0].text).toContain('Found 1 social conversations');
  });

  it('drops blank, non-numeric and non-boolean filters', async () => {
    const client = buildClient();

    await call(client, 'list_social_conversations', {
      limit: Number.NaN,
      needsReview: 'yes',
      page: 'two',
      search: '   ',
      status: '',
    });

    expect(client.listSocialConversations).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: undefined,
        needsReview: undefined,
        page: undefined,
        search: undefined,
        status: undefined,
      }),
    );
  });

  it('reports an empty conversation list', async () => {
    const client = buildClient();
    client.listSocialConversations.mockResolvedValue({ conversations: [] });

    const result = await call(client, 'list_social_conversations', {});

    expect(result.content[0].text).toBe('No social conversations found.');
  });

  it('defaults includeMessages to true and forwards the limit', async () => {
    const client = buildClient();

    const result = await call(client, 'get_social_conversation', {
      conversationId: 'conversation-1',
      limit: 50,
    });

    expect(client.getSocialConversation).toHaveBeenCalledWith(
      'conversation-1',
      { includeMessages: true, limit: 50 },
    );
    expect(result.content[0].text).toContain('Social conversation');
  });

  it('honours an explicit includeMessages: false', async () => {
    const client = buildClient();

    await call(client, 'get_social_conversation', {
      conversationId: 'conversation-1',
      includeMessages: false,
    });

    expect(client.getSocialConversation).toHaveBeenCalledWith(
      'conversation-1',
      { includeMessages: false, limit: undefined },
    );
  });
});

describe('handleSocialMessagesTool — authoring', () => {
  it('builds full action params for a reply draft', async () => {
    const client = buildClient();

    const result = await call(client, 'create_social_reply_draft', {
      conversationId: 'conversation-1',
      idempotencyKey: 'key-1',
      messageType: 'reply',
      recipientId: 'recipient-1',
      text: 'Thanks for reaching out!',
      workflowRunId: 'workflow-1',
    });

    expect(client.createSocialReplyDraft).toHaveBeenCalledWith(
      'conversation-1',
      {
        idempotencyKey: 'key-1',
        messageType: 'reply',
        recipientId: 'recipient-1',
        text: 'Thanks for reaching out!',
        workflowRunId: 'workflow-1',
      },
    );
    expect(result.content[0].text).toContain('Created social reply draft');
  });

  it('publishes a reply', async () => {
    const client = buildClient();

    const result = await call(client, 'post_social_reply', {
      conversationId: 'conversation-1',
      text: 'On it.',
    });

    expect(client.postSocialReply).toHaveBeenCalledWith(
      'conversation-1',
      expect.objectContaining({ messageType: undefined, text: 'On it.' }),
    );
    expect(result.content[0].text).toContain('Published social reply');
  });

  it('sends a DM', async () => {
    const client = buildClient();

    const result = await call(client, 'send_social_dm', {
      conversationId: 'conversation-1',
      messageType: 'dm',
      text: 'Sent you the details.',
    });

    expect(client.sendSocialDm).toHaveBeenCalledWith(
      'conversation-1',
      expect.objectContaining({ messageType: 'dm' }),
    );
    expect(result.content[0].text).toContain('Sent social DM');
  });

  it('rejects an unsupported messageType', async () => {
    const client = buildClient();

    await expect(
      call(client, 'post_social_reply', {
        conversationId: 'conversation-1',
        messageType: 'carrier-pigeon',
        text: 'hi',
      }),
    ).rejects.toThrow('messageType must be "reply" or "dm"');
    expect(client.postSocialReply).not.toHaveBeenCalled();
  });

  it('requires message text', async () => {
    const client = buildClient();

    await expect(
      call(client, 'post_social_reply', {
        conversationId: 'conversation-1',
        text: '   ',
      }),
    ).rejects.toThrow('text is required');
  });

  it('requires a conversation id', async () => {
    const client = buildClient();

    await expect(call(client, 'get_social_conversation', {})).rejects.toThrow(
      'conversationId is required',
    );
  });
});

describe('handleSocialMessagesTool — moderation', () => {
  it('approves a draft', async () => {
    const client = buildClient();

    const result = await call(client, 'approve_social_draft', {
      conversationId: 'conversation-1',
      messageId: 'message-1',
    });

    expect(client.approveSocialDraft).toHaveBeenCalledWith(
      'conversation-1',
      'message-1',
    );
    expect(result.content[0].text).toContain(
      'Approved and published social draft',
    );
  });

  it('rejects a draft with an optional reason', async () => {
    const client = buildClient();

    const result = await call(client, 'reject_social_draft', {
      conversationId: 'conversation-1',
      messageId: 'message-1',
      reason: 'Off brand',
    });

    expect(client.rejectSocialDraft).toHaveBeenCalledWith(
      'conversation-1',
      'message-1',
      'Off brand',
    );
    expect(result.content[0].text).toContain('Rejected social draft');
  });

  it('rejects a draft without a reason', async () => {
    const client = buildClient();

    await call(client, 'reject_social_draft', {
      conversationId: 'conversation-1',
      messageId: 'message-1',
    });

    expect(client.rejectSocialDraft).toHaveBeenCalledWith(
      'conversation-1',
      'message-1',
      undefined,
    );
  });

  it('trims and compacts tags', async () => {
    const client = buildClient();

    const result = await call(client, 'tag_social_conversation', {
      conversationId: 'conversation-1',
      tags: [' vip ', '', 'refund'],
    });

    expect(client.updateSocialTags).toHaveBeenCalledWith('conversation-1', [
      'vip',
      'refund',
    ]);
    expect(result.content[0].text).toContain(
      'Updated social conversation tags',
    );
  });

  it('refuses a tag list that is not all strings', async () => {
    const client = buildClient();

    await expect(
      call(client, 'tag_social_conversation', {
        conversationId: 'conversation-1',
        tags: ['vip', 7],
      }),
    ).rejects.toThrow('tags must be an array of strings');
  });

  it('refuses a non-array tag value', async () => {
    const client = buildClient();

    await expect(
      call(client, 'tag_social_conversation', {
        conversationId: 'conversation-1',
        tags: 'vip',
      }),
    ).rejects.toThrow('tags must be an array of strings');
  });

  it('assigns an owner', async () => {
    const client = buildClient();

    const result = await call(client, 'assign_social_conversation', {
      assignedOwnerId: 'user-1',
      conversationId: 'conversation-1',
    });

    expect(client.assignSocialConversation).toHaveBeenCalledWith(
      'conversation-1',
      'user-1',
    );
    expect(result.content[0].text).toContain(
      'Updated social conversation assignment',
    );
  });

  it('passes an explicit null through to unassign', async () => {
    const client = buildClient();

    await call(client, 'assign_social_conversation', {
      assignedOwnerId: null,
      conversationId: 'conversation-1',
    });

    expect(client.assignSocialConversation).toHaveBeenCalledWith(
      'conversation-1',
      null,
    );
  });

  it('marks a conversation resolved', async () => {
    const client = buildClient();

    const result = await call(client, 'mark_social_conversation_resolved', {
      conversationId: 'conversation-1',
    });

    expect(client.markSocialConversationResolved).toHaveBeenCalledWith(
      'conversation-1',
    );
    expect(result.content[0].text).toContain(
      'Marked social conversation resolved',
    );
  });

  it('rejects an unknown social messages tool name', () => {
    const client = buildClient();

    expect(() => call(client, 'delete_social_conversation', {})).toThrow(
      /Unknown social messages tool: delete_social_conversation/,
    );
  });
});
