import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildAgentSkillsIndex,
  buildMcpServerCard,
  getPublishedAgentSkill,
  HOMEPAGE_AGENT_MARKDOWN,
  PUBLISHED_AGENT_SKILL_NAMES,
} from './agent-readiness.data';

describe('agent readiness metadata', () => {
  it('publishes an MCP server card with the canonical remote transport', () => {
    expect(buildMcpServerCard()).toMatchObject({
      protocolVersion: '2025-06-18',
      serverInfo: {
        name: 'genfeed-mcp-server',
        title: 'Genfeed MCP Server',
        version: '1.0.0',
      },
      transport: {
        endpoint: 'https://mcp.genfeed.ai/mcp',
        type: 'streamable-http',
      },
    });
  });

  it('publishes every product skill with a verifiable SHA-256 digest', () => {
    const index = buildAgentSkillsIndex();

    expect(index.$schema).toBe(
      'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
    );
    expect(index.skills).toHaveLength(PUBLISHED_AGENT_SKILL_NAMES.length);

    for (const entry of index.skills) {
      const skill = getPublishedAgentSkill(entry.name);
      expect(skill).not.toBeNull();
      expect(entry.digest).toBe(
        `sha256:${createHash('sha256')
          .update(skill?.content ?? '')
          .digest('hex')}`,
      );
      expect(entry.url).toBe(
        `https://genfeed.ai/.well-known/agent-skills/${entry.name}/SKILL.md`,
      );
    }
  });

  it('provides useful markdown instead of mirroring the HTML shell', () => {
    expect(HOMEPAGE_AGENT_MARKDOWN).toContain('# Genfeed.ai');
    expect(HOMEPAGE_AGENT_MARKDOWN).toContain('https://docs.genfeed.ai');
    expect(HOMEPAGE_AGENT_MARKDOWN).toContain(
      'https://genfeed.ai/.well-known/api-catalog',
    );
  });
});
