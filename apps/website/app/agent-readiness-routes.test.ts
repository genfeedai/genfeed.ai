import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GET as getAgentContent } from './.well-known/agent-content/home/route';
import { GET as getAgentSkillsIndex } from './.well-known/agent-skills/index.json/route';
import {
  dynamic as authAliasDynamic,
  revalidate as authAliasRevalidate,
  GET as getAuthAlias,
} from './.well-known/auth.md/route';
import { GET as getMcpServerCard } from './.well-known/mcp/server-card.json/route';
import {
  GET as getMcpCardsAlias,
  dynamic as mcpCardsAliasDynamic,
  revalidate as mcpCardsAliasRevalidate,
} from './.well-known/mcp/server-cards.json/route';
import {
  GET as getMcpAlias,
  dynamic as mcpAliasDynamic,
  revalidate as mcpAliasRevalidate,
} from './.well-known/mcp.json/route';
import { GET as getProtectedResourceMetadata } from './.well-known/oauth-protected-resource/route';

describe('website discovery routes', () => {
  it.each([
    '.well-known/auth.md/route.ts',
    '.well-known/mcp.json/route.ts',
    '.well-known/mcp/server-cards.json/route.ts',
    '.well-known/oauth-protected-resource/route.ts',
  ])('declares static route config locally in %s', (relativePath) => {
    const source = readFileSync(
      join(import.meta.dirname, relativePath),
      'utf8',
    );

    expect(source).toContain("export const dynamic = 'force-static';");
    expect(source).toContain('export const revalidate = false;');
    expect(source).not.toMatch(/export\s*\{[^}]*\b(dynamic|revalidate)\b/);
  });

  it('serves negotiated homepage content as markdown', async () => {
    const response = getAgentContent();

    expect(response.headers.get('content-type')).toContain('text/markdown');
    expect(response.headers.get('vary')).toBe('Accept');
    expect(await response.text()).toContain('# Genfeed.ai');
  });

  it('serves the Agent Skills v0.2 discovery index', async () => {
    const response = getAgentSkillsIndex();
    const body = await response.json();

    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(body.$schema).toBe(
      'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
    );
    expect(body.skills.length).toBeGreaterThan(0);
  });

  it('serves the MCP server card from the standardized path', async () => {
    const response = getMcpServerCard();
    const body = await response.json();

    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(body.serverInfo.name).toBe('genfeed-mcp-server');
    expect(body.transport.endpoint).toBe('https://mcp.genfeed.ai/mcp');
  });

  it('serves origin-bound OAuth Protected Resource Metadata', async () => {
    const response = getProtectedResourceMetadata();
    const body = await response.json();

    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(body).toMatchObject({
      authorization_servers: ['https://api.genfeed.ai'],
      bearer_methods_supported: ['header'],
      resource: 'https://genfeed.ai',
    });
    expect(body.scopes_supported).toEqual(
      expect.arrayContaining(['brands:read', 'posts:draft', 'analytics:read']),
    );
  });

  it('keeps compatibility aliases static while sharing canonical handlers', async () => {
    expect([authAliasDynamic, mcpAliasDynamic, mcpCardsAliasDynamic]).toEqual([
      'force-static',
      'force-static',
      'force-static',
    ]);
    expect([
      authAliasRevalidate,
      mcpAliasRevalidate,
      mcpCardsAliasRevalidate,
    ]).toEqual([false, false, false]);

    const authResponse = getAuthAlias();
    const mcpResponse = getMcpAlias();
    const mcpCardsResponse = getMcpCardsAlias();

    expect(authResponse.headers.get('content-type')).toContain('text/markdown');
    expect(await authResponse.text()).toMatch(/^# .*auth\.md/im);
    expect(await mcpResponse.json()).toEqual(await mcpCardsResponse.json());
  });
});
