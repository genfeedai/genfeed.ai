import {
  E2E_TOKENS,
  type FakeGenfeedApi,
  startFakeGenfeedApi,
} from './support/fake-genfeed-api';
import {
  type McpTestServer,
  startMcpTestServer,
} from './support/mcp-test-server';

/**
 * End-to-end journey for the hosted MCP server, in the order a connecting
 * client experiences it: authenticate, read the account, list brands, try an
 * admin-gated onboarding action, then start a generation.
 *
 * Requests travel over real HTTP through the production MCP request path
 * (middleware, `AuthService`, `StreamableHttpService`, tool registry, role
 * guard) to a fake Genfeed API that enforces the same API-key rules as the
 * real one: a key never inherits org-admin without the explicit `admin` scope.
 */
describe('MCP server e2e', () => {
  let api: FakeGenfeedApi;
  let mcp: McpTestServer;

  beforeAll(async () => {
    api = await startFakeGenfeedApi();
    mcp = await startMcpTestServer(api.baseUrl);
  });

  afterAll(async () => {
    await mcp.close();
    await api.close();
  });

  beforeEach(() => {
    api.requests.length = 0;
  });

  function upstreamPaths(): string[] {
    return api.requests.map((request) => `${request.method} ${request.path}`);
  }

  describe('1. auth', () => {
    it('rejects a request without a bearer token and points at OAuth', async () => {
      const { status, headers } = await mcp.callTool(undefined, 'get_account');

      expect(status).toBe(401);
      expect(headers.get('www-authenticate')).toContain('resource_metadata=');
      expect(upstreamPaths()).toEqual([]);
    });

    it('rejects a token the API does not recognise', async () => {
      const { status, body } = await mcp.callTool(
        'gf_e2e_unknown_token_0000000000000000000',
        'get_account',
      );

      expect(status).toBe(401);
      expect(body.error?.message).toBe('Invalid bearer token');
    });

    it('accepts a valid token and initializes the session', async () => {
      const { status, body } = await mcp.initialize(
        E2E_TOKENS.ownerWithAdminScope,
      );

      expect(status).toBe(200);
      expect(body.result?.serverInfo.name).toBe('genfeed-mcp-server');
    });

    it('resolves the token owner identity against the API on every call', async () => {
      await mcp.callTool(E2E_TOKENS.ownerWithAdminScope, 'get_account');

      expect(upstreamPaths()).toContain('GET /v1/auth/whoami');
    });
  });

  describe('2. get_account role', () => {
    it('reports the owner role and credits for an owner key with the admin scope', async () => {
      const { body } = await mcp.callTool(
        E2E_TOKENS.ownerWithAdminScope,
        'get_account',
      );

      const text = body.result?.content?.[0]?.text ?? '';
      expect(body.result?.isError).not.toBe(true);
      expect(text).toContain('Role: Owner');
      expect(text).toMatch(/11,?222/);
    });

    it('keeps an owner key without the admin scope on the user role', async () => {
      const { body } = await mcp.callTool(E2E_TOKENS.ownerCapped, 'get_account');

      expect(body.result?.content?.[0]?.text).toContain('Role: User');
    });
  });

  describe('3. get_brands', () => {
    it('lists every brand of the org for an owner key with the admin scope', async () => {
      const { body } = await mcp.callTool(
        E2E_TOKENS.ownerWithAdminScope,
        'get_brands',
      );

      const payload = JSON.stringify(body.result);
      expect(body.result?.isError).not.toBe(true);
      expect(payload).toContain('brand_studio_main');
      expect(payload).toContain('brand_studio_kids');
      expect(payload).not.toContain('brand_agency_main');
    });

    it('lists only the assigned brands for a plain member', async () => {
      const { body } = await mcp.callTool(E2E_TOKENS.member, 'get_brands');

      const payload = JSON.stringify(body.result);
      expect(payload).toContain('brand_studio_kids');
      expect(payload).not.toContain('brand_studio_main');
    });

    it('lists no brands for an owner key without the admin scope', async () => {
      const { body } = await mcp.callTool(E2E_TOKENS.ownerCapped, 'get_brands');

      const payload = JSON.stringify(body.result);
      expect(payload).not.toContain('brand_studio_main');
      expect(payload).not.toContain('brand_studio_kids');
    });
  });

  describe('4. onboard_brand admin-role check', () => {
    const createFromUrl = {
      action: 'create_from_url',
      url: 'https://example.com',
    };

    it.each([
      ['an owner key without the admin scope', E2E_TOKENS.ownerCapped],
      ['a plain member', E2E_TOKENS.member],
    ])('denies %s before anything reaches the API', async (_label, token) => {
      const { body } = await mcp.callTool(
        token,
        'onboard_brand',
        createFromUrl,
      );

      expect(body.result?.isError).toBe(true);
      expect(body.result?.content?.[0]?.text).toContain("requires 'admin'");
      expect(upstreamPaths()).not.toContain('POST /v1/mcp-approvals');
    });

    it('queues brand creation for approval for an owner key with the admin scope', async () => {
      const { body } = await mcp.callTool(
        E2E_TOKENS.ownerWithAdminScope,
        'onboard_brand',
        createFromUrl,
      );

      expect(JSON.stringify(body.result)).toContain('approval_pending');
      const approval = api.requests.find(
        (request) => request.path === '/v1/mcp-approvals',
      );
      expect(approval?.body).toMatchObject({
        arguments: { url: 'https://example.com' },
        toolName: 'create_brand_from_url',
      });
    });
  });

  describe('5. generate dry path', () => {
    it('asks for a brand and lists the choices when none is given', async () => {
      const { body } = await mcp.callTool(
        E2E_TOKENS.ownerWithAdminScope,
        'generate',
        { prompt: 'a lighthouse at dusk', type: 'image' },
      );

      const payload = JSON.stringify(body.result);
      expect(payload).toContain('brand_required');
      expect(payload).toContain('Studio Main');
      expect(upstreamPaths()).not.toContain('POST /v1/mcp-approvals');
    });

    it('queues the generation for approval without spending credits', async () => {
      const { body } = await mcp.callTool(
        E2E_TOKENS.ownerWithAdminScope,
        'generate',
        {
          brandId: 'brand_studio_main',
          prompt: 'a lighthouse at dusk',
          type: 'image',
        },
      );

      expect(JSON.stringify(body.result)).toContain('approval_pending');
      const approval = api.requests.find(
        (request) => request.path === '/v1/mcp-approvals',
      );
      expect(approval?.body).toMatchObject({
        arguments: { brandId: 'brand_studio_main' },
        toolName: 'generate',
      });
      expect(upstreamPaths()).not.toContain(
        'POST /v1/agent-tools/generate/execute',
      );
    });
  });

  describe('6. list_orgs', () => {
    it('lists every organization of the user and flags the one the token is bound to', async () => {
      const { body } = await mcp.callTool(
        E2E_TOKENS.ownerWithAdminScope,
        'list_orgs',
      );

      const payload = JSON.stringify(body.result);
      expect(body.result?.isError).not.toBe(true);
      for (const organizationId of ['org_studio', 'org_agency', 'org_labs']) {
        expect(payload).toContain(organizationId);
      }
      expect(payload).toContain('reconnect');
    });
  });
});
