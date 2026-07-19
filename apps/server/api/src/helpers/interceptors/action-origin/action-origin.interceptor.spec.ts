import { createHash } from 'node:crypto';
import { ActionOriginInterceptor } from '@api/helpers/interceptors/action-origin/action-origin.interceptor';
import { ActionOrigin, MCP_ACTION_ORIGIN_PROOF_HEADER } from '@genfeedai/enums';
import { getActionOriginContext } from '@genfeedai/server';
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

  it('derives MCP only from the trusted service proof header', async () => {
    await expect(
      readContext({
        headers: {
          [MCP_ACTION_ORIGIN_PROOF_HEADER]: trustedProof,
        },
        user: {
          publicMetadata: {
            apiKeyId: 'key-1',
            isApiKey: true,
            user: 'user-1',
          },
        },
      }),
    ).resolves.toEqual({
      actorUserId: 'user-1',
      apiKeyId: 'key-1',
      origin: ActionOrigin.MCP,
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
          publicMetadata: {
            apiKeyId: 'key-1',
            isApiKey: true,
            user: 'user-1',
          },
        },
      }),
    ).resolves.toEqual({
      actorUserId: 'user-1',
      apiKeyId: 'key-1',
      origin: ActionOrigin.API,
    });
  });

  it('uses trusted API-key issuance metadata for CLI and UI otherwise', async () => {
    await expect(
      readContext({
        headers: {},
        user: {
          publicMetadata: {
            actionOrigin: ActionOrigin.CLI,
            apiKeyId: 'key-1',
            isApiKey: true,
            user: 'user-1',
          },
        },
      }),
    ).resolves.toMatchObject({ origin: ActionOrigin.CLI });
    await expect(
      readContext({
        headers: {},
        user: { publicMetadata: { user: 'user-1' } },
      }),
    ).resolves.toMatchObject({ origin: ActionOrigin.UI });
  });
});
