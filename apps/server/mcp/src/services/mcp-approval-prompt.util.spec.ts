import {
  approvalPromptMessage,
  canPromptForApproval,
  createApprovalPromptCodec,
  promptForApproval,
  readApprovalPromptRound,
} from '@mcp/services/mcp-approval-prompt.util';
import {
  CLIENT_CAPABILITIES_META_KEY,
  PROTOCOL_VERSION_META_KEY,
  type ServerContext,
} from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';

const SERVICE_KEY = 'service-key-shared-by-mcp-and-api';

function context(input: {
  envelope?: Record<string, unknown>;
  inputResponses?: Record<string, unknown>;
  state?: unknown;
}): ServerContext {
  return {
    mcpReq: {
      envelope: input.envelope,
      id: 1,
      inputResponses: input.inputResponses,
      method: 'tools/call',
      requestState: () => input.state,
    },
  } as unknown as ServerContext;
}

function modernEnvelope(capabilities: Record<string, unknown>) {
  return {
    [CLIENT_CAPABILITIES_META_KEY]: capabilities,
    [PROTOCOL_VERSION_META_KEY]: '2026-07-28',
  };
}

const pendingResult = {
  content: [{ text: 'This action requires approval.', type: 'text' }],
  isError: true,
  structuredContent: {
    approvalId: 'apr-1',
    code: 'approval_pending',
    estimatedCredits: 100,
    toolName: 'generate',
  },
};

describe('canPromptForApproval', () => {
  it.each([
    [
      'form elicitation (empty object)',
      modernEnvelope({ elicitation: {} }),
      true,
    ],
    ['form elicitation', modernEnvelope({ elicitation: { form: {} } }), true],
    [
      'URL-only elicitation',
      modernEnvelope({ elicitation: { url: {} } }),
      false,
    ],
    ['no elicitation', modernEnvelope({}), false],
    ['a 2025-era request', undefined, false],
  ])('%s → %s', (_label, envelope, expected) => {
    expect(canPromptForApproval(context({ envelope }))).toBe(expected);
  });
});

describe('readApprovalPromptRound', () => {
  const state = { approvalId: 'apr-1', toolName: 'generate' };

  it.each([
    ['accept', { approvalId: 'apr-1', decision: 'approve' }],
    ['decline', { approvalId: 'apr-1', decision: 'decline' }],
  ])('reads %s as the person’s decision', (action, answer) => {
    const round = readApprovalPromptRound(
      context({ inputResponses: { approval: { action } }, state }),
      'generate',
    );

    expect(round).toEqual({ answer, wasPrompted: true });
  });

  it.each([
    ['a cancelled prompt', { approval: { action: 'cancel' } }],
    ['no answer', undefined],
  ])('leaves the approval pending after %s', (_label, inputResponses) => {
    expect(
      readApprovalPromptRound(context({ inputResponses, state }), 'generate'),
    ).toEqual({ wasPrompted: true });
  });

  it.each([
    ['state minted for another tool', state, 'create_post'],
    ['unsigned raw state', 'apr-1', 'generate'],
    ['no state', undefined, 'generate'],
  ])('ignores %s', (_label, roundState, toolName) => {
    expect(
      readApprovalPromptRound(
        context({
          inputResponses: { approval: { action: 'accept' } },
          state: roundState,
        }),
        toolName,
      ),
    ).toEqual({ wasPrompted: false });
  });
});

describe('approvalPromptMessage', () => {
  it.each([
    [
      { estimatedCredits: 100, toolName: 'generate' },
      { model: 'nano-banana-pro', type: 'image' },
      [
        'Genfeed needs your approval. Generate an image with nano-banana-pro? It uses about 100 credits.',
        '- model: nano-banana-pro',
        '- type: image',
        'Accept to run it now, or decline to cancel it.',
      ].join('\n'),
    ],
    [
      { toolName: 'generate' },
      { organization: 'genfeedai', type: 'video' },
      [
        'Genfeed needs your approval. Generate a video?',
        '- type: video',
        'Accept to run it now, or decline to cancel it.',
      ].join('\n'),
    ],
    [
      { toolName: 'some_unlisted_tool' },
      {
        platforms: ['instagram', 'tiktok'],
        scheduledAt: '2026-11-09T10:00:00Z',
        text: 'Launch   day\nis here',
      },
      [
        'Genfeed needs your approval. Run "some_unlisted_tool"?',
        '- platforms: instagram, tiktok',
        '- scheduledAt: 2026-11-09T10:00:00Z',
        '- text: "Launch   day\\nis here"',
        'Accept to run it now, or decline to cancel it.',
      ].join('\n'),
    ],
    [
      { toolName: 'some_unlisted_tool' },
      {},
      [
        'Genfeed needs your approval. Run "some_unlisted_tool"?',
        'Accept to run it now, or decline to cancel it.',
      ].join('\n'),
    ],
    [
      { toolName: 'some_unlisted_tool' },
      {
        idempotencyKey: 'launch-1',
        release: {
          content: { caption: '', text: 'A long caption '.repeat(20).trim() },
          scheduledDate: '2026-11-09T10:00:00Z',
          targets: [
            { credentialId: 'cred-ig', platform: 'instagram' },
            { credentialId: 'cred-tt', platform: 'tiktok' },
          ],
        },
      },
      [
        'Genfeed needs your approval. Run "some_unlisted_tool"?',
        '- idempotencyKey: launch-1',
        `- release.content.text: ${'A long caption '.repeat(20).trim()}`,
        '- release.scheduledDate: 2026-11-09T10:00:00Z',
        '- release.targets[0].credentialId: cred-ig',
        '- release.targets[0].platform: instagram',
        '- release.targets[1].credentialId: cred-tt',
        '- release.targets[1].platform: tiktok',
        'Accept to run it now, or decline to cancel it.',
      ].join('\n'),
    ],
  ])('words the prompt for %o', (pending, args, expected) => {
    expect(approvalPromptMessage(pending, args)).toBe(expected);
  });

  it.each([
    ['a value too long to show in full', { text: 'x'.repeat(2500) }],
    [
      'a value whose spacing makes it too long',
      { text: `a${' '.repeat(2500)}b` },
    ],
    [
      'more nested fields than fit',
      {
        targets: Array.from({ length: 25 }, () => ({ platform: 'instagram' })),
      },
    ],
  ])('cannot word the prompt for %s', (_label, args) => {
    expect(approvalPromptMessage({ toolName: 'generate' }, args)).toBeNull();
  });
});

describe('promptForApproval', () => {
  const ctx = context({ envelope: modernEnvelope({ elicitation: {} }) });

  it('asks the person and signs the approval into the request state', async () => {
    const codec = createApprovalPromptCodec(SERVICE_KEY, 'caller-token');
    if (!codec) throw new Error('codec expected');

    const prompt = await promptForApproval(
      codec,
      ctx,
      {
        args: { model: 'nano-banana-pro', type: 'image' },
        toolName: 'generate',
      },
      pendingResult,
    );

    expect(prompt?.resultType).toBe('input_required');
    expect(prompt?.inputRequests?.approval).toMatchObject({
      method: 'elicitation/create',
      params: {
        message: expect.stringContaining(
          'Generate an image with nano-banana-pro? It uses about 100 credits.',
        ),
      },
    });
    await expect(
      codec.verify(prompt?.requestState ?? '', ctx),
    ).resolves.toEqual({ approvalId: 'apr-1', toolName: 'generate' });
  });

  it('signs state that another caller cannot replay', async () => {
    const codec = createApprovalPromptCodec(SERVICE_KEY, 'caller-token');
    const otherCaller = createApprovalPromptCodec(SERVICE_KEY, 'other-token');
    if (!codec || !otherCaller) throw new Error('codecs expected');

    const prompt = await promptForApproval(
      codec,
      ctx,
      { args: {}, toolName: 'generate' },
      pendingResult,
    );

    await expect(
      otherCaller.verify(prompt?.requestState ?? '', ctx),
    ).rejects.toThrow();
  });

  it('keeps the inbox link when the arguments cannot be shown in full', async () => {
    const codec = createApprovalPromptCodec(SERVICE_KEY, 'caller-token');
    if (!codec) throw new Error('codec expected');

    await expect(
      promptForApproval(
        codec,
        ctx,
        { args: { text: 'x'.repeat(2500) }, toolName: 'generate' },
        pendingResult,
      ),
    ).resolves.toBeNull();
  });

  it('leaves a result that is not a pending approval alone', async () => {
    const codec = createApprovalPromptCodec(SERVICE_KEY, 'caller-token');
    if (!codec) throw new Error('codec expected');

    await expect(
      promptForApproval(
        codec,
        ctx,
        { args: {}, toolName: 'generate' },
        { content: [{ text: 'done', type: 'text' }] },
      ),
    ).resolves.toBeNull();
  });

  it.each([
    ['no service key', undefined, 'caller-token'],
    ['no caller token', SERVICE_KEY, undefined],
  ])('is unavailable with %s', (_label, serviceKey, token) => {
    expect(createApprovalPromptCodec(serviceKey, token)).toBeNull();
  });
});
