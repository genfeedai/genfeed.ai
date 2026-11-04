import {
  assertApiKeyAgentToolBaselineAccess,
  resolveApiKeyRouteAccess,
} from '@api/helpers/utils/auth/api-key-baseline-scope.util';
import { ApiKeyScope } from '@genfeedai/contracts';
import { API_KEY_SCOPE_PRESETS } from '@genfeedai/contracts/constants';
import { ForbiddenException } from '@nestjs/common';

const READ = [...API_KEY_SCOPE_PRESETS.read];
const MCP = [...API_KEY_SCOPE_PRESETS.mcp];

describe('resolveApiKeyRouteAccess', () => {
  it.each([
    ['GET', undefined, 'read'],
    ['get', undefined, 'read'],
    ['HEAD', undefined, 'read'],
    ['OPTIONS', undefined, 'read'],
    ['POST', undefined, 'write'],
    ['PATCH', undefined, 'write'],
    ['PUT', undefined, 'write'],
    ['DELETE', undefined, 'write'],
    [undefined, undefined, 'write'],
    ['POST', 'read', 'read'],
  ] as const)(
    '%s with declared access %s needs %s',
    (method, declared, expected) => {
      expect(resolveApiKeyRouteAccess(method, declared)).toBe(expected);
    },
  );
});

describe('assertApiKeyAgentToolBaselineAccess', () => {
  it.each([
    ['a read-preset key', READ, 'get_brands'],
    ['an mcp-preset key', MCP, 'get_brands'],
    ['an mcp-preset key', MCP, 'create_post'],
    ['an admin key', [ApiKeyScope.ADMIN], 'create_post'],
  ])('lets %s run %s', (_label, scopes, tool) => {
    expect(() =>
      assertApiKeyAgentToolBaselineAccess({ isApiKey: true, scopes }, tool),
    ).not.toThrow();
  });

  it('leaves session callers to their role checks', () => {
    expect(() =>
      assertApiKeyAgentToolBaselineAccess(
        { isApiKey: false, scopes: [] },
        'create_post',
      ),
    ).not.toThrow();
  });

  it.each([
    ['a read-preset key', READ, 'create_post'],
    ['a read-preset key', READ, 'transform_media'],
    ['a key without scopes', [], 'get_brands'],
  ])('refuses %s running %s', (_label, scopes, tool) => {
    expect(() =>
      assertApiKeyAgentToolBaselineAccess({ isApiKey: true, scopes }, tool),
    ).toThrow(ForbiddenException);
  });
});
