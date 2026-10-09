import { createHash } from 'node:crypto';
import { ActionOriginInterceptor } from '@api/helpers/interceptors/action-origin/action-origin.interceptor';
import { getActionOriginContext } from '@api/index';
import {
  ActionOrigin,
  MCP_ACTION_ORIGIN_PROOF_HEADER,
} from '@genfeedai/contracts';
import {
  GENERATION_ENTRY_HEADER,
  GenerationEntryAttribution,
  GenerationEntryChannel,
} from '@genfeedai/contracts/interfaces/content/generation-entry.interface';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { defer, firstValueFrom, of } from 'rxjs';

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('ActionOriginInterceptor', () => {
  const trustedProof = createHash('sha256')
    .update('internal-service-key')
    .digest('base64url');
  const configService = {
    get: vi.fn((key: string) =>
      key === 'GENFEEDAI_API_KEY' ? 'internal-service-key' : undefined,
    ),
  };
  const interceptor = new ActionOriginInterceptor(configService as never);

  async function readContext(request: Record<string, unknown>) {
    const next = {
      handle: () => of(null),
    } as CallHandler;
    let captured: ReturnType<typeof getActionOriginContext> | undefined;
    next.handle = () =>
      defer(() => {
        captured = getActionOriginContext();
        return of(null);
      });
    await firstValueFrom(interceptor.intercept(makeContext(request), next));
    return captured;
  }

  it.each([GenerationEntryChannel.WEB, GenerationEntryChannel.DESKTOP])(
    'captures UI %s as a descriptive hint',
    async (channel) => {
      expect(
        await readContext({
          headers: { [GENERATION_ENTRY_HEADER]: channel },
          user: { userId: 'user-1' },
        }),
      ).toEqual({
        actorUserId: 'user-1',
        origin: ActionOrigin.UI,
        generationEntry: {
          channel,
          attribution: GenerationEntryAttribution.CLIENT_REPORTED,
        },
      });
    },
  );
  it('ignores hints on verified API/MCP ingress and rejects unsupported UI hints', async () => {
    expect(
      await readContext({
        headers: { [GENERATION_ENTRY_HEADER]: 'desktop' },
        user: { isApiKey: true, userId: 'user-1' },
      }),
    ).toMatchObject({
      origin: ActionOrigin.API,
      generationEntry: { channel: 'api', attribution: 'server_verified' },
    });
    expect(
      await readContext({
        headers: {
          [GENERATION_ENTRY_HEADER]: 'web',
          [MCP_ACTION_ORIGIN_PROOF_HEADER]: trustedProof,
        },
        user: { userId: 'user-1' },
      }),
    ).toMatchObject({
      origin: ActionOrigin.MCP,
      generationEntry: { channel: 'mcp', attribution: 'server_verified' },
    });
    expect(
      await readContext({
        headers: { [GENERATION_ENTRY_HEADER]: 'mcp' },
        user: { userId: 'user-1' },
      }),
    ).not.toHaveProperty('generationEntry');
    expect(
      await readContext({ headers: {}, user: { userId: 'user-1' } }),
    ).not.toHaveProperty('generationEntry');
  });

  it('derives MCP only from the trusted service proof header', async () => {
    await expect(
      readContext({
        headers: {
          [MCP_ACTION_ORIGIN_PROOF_HEADER]: trustedProof,
        },
        user: {
          apiKeyId: 'key-1',
          isApiKey: true,
          userId: 'user-1',
        },
      }),
    ).resolves.toEqual({
      actorUserId: 'user-1',
      apiKeyId: 'key-1',
      origin: ActionOrigin.MCP,
      generationEntry: {
        channel: GenerationEntryChannel.MCP,
        attribution: GenerationEntryAttribution.SERVER_VERIFIED,
      },
    });
  });

  it('ignores caller-supplied origin labels without valid service proof', async () => {
    await expect(
      readContext({
        headers: {
          [MCP_ACTION_ORIGIN_PROOF_HEADER]: 'spoofed-service-proof',
          'x-action-origin': 'mcp',
        },
        user: {
          apiKeyId: 'key-1',
          isApiKey: true,
          userId: 'user-1',
        },
      }),
    ).resolves.toEqual({
      actorUserId: 'user-1',
      apiKeyId: 'key-1',
      origin: ActionOrigin.API,
      generationEntry: {
        channel: GenerationEntryChannel.API,
        attribution: GenerationEntryAttribution.SERVER_VERIFIED,
      },
    });
  });

  it('uses trusted API-key issuance metadata for CLI, MCP, and UI otherwise', async () => {
    await expect(
      readContext({
        headers: {},
        user: {
          actionOrigin: ActionOrigin.CLI,
          apiKeyId: 'key-1',
          isApiKey: true,
          userId: 'user-1',
        },
      }),
    ).resolves.toMatchObject({ origin: ActionOrigin.CLI });
    await expect(
      readContext({
        headers: {},
        user: {
          actionOrigin: ActionOrigin.MCP,
          apiKeyId: 'key-2',
          isApiKey: true,
          userId: 'user-1',
        },
      }),
    ).resolves.toMatchObject({ origin: ActionOrigin.MCP });
    await expect(
      readContext({
        headers: {},
        user: { userId: 'user-1' },
      }),
    ).resolves.toMatchObject({ origin: ActionOrigin.UI });
  });
});
