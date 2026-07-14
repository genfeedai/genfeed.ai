import { readdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AGENT_ONLY_TOOLS } from './agent-only/index.js';
import { BRAND_INTERVIEW_TOOLS } from './brand-interview.tools.js';
import { SOURCE_TOOLS } from './index.js';
import { MCP_ADMIN_TOOLS } from './mcp-only/admin.tools.js';
import { MCP_ONLY_TOOLS } from './mcp-only/index.js';
import { OVERLAP_TOOLS } from './overlap.tools.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAX_MODULE_LINES = 500;
const REQUIRED_ROLES = new Set(['user', 'admin', 'superadmin']);

function listToolModuleFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      out.push(...listToolModuleFiles(full));
    } else if (entry.name.endsWith('.tools.ts')) {
      out.push(full);
    }
  }
  return out;
}

function countLines(filePath: string): number {
  return readFileSync(filePath, 'utf8').replace(/\n$/, '').split('\n').length;
}

describe('hand-authored action definitions', () => {
  it('has no duplicate action names', () => {
    const names = SOURCE_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('concatenates every definition shard in order', () => {
    expect(SOURCE_TOOLS).toEqual([
      ...OVERLAP_TOOLS,
      ...AGENT_ONLY_TOOLS,
      ...MCP_ONLY_TOOLS,
      ...BRAND_INTERVIEW_TOOLS,
    ]);
  });

  it('keeps surface intent out of definition shards', () => {
    for (const tool of SOURCE_TOOLS) {
      expect(tool).not.toHaveProperty('surfaces');
    }
  });

  it('exposes a well-formed definition for every action', () => {
    for (const tool of SOURCE_TOOLS) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.parameters.type).toBe('object');
      expect(typeof tool.parameters.properties).toBe('object');
      expect(typeof tool.creditCost).toBe('number');
      expect(REQUIRED_ROLES.has(tool.requiredRole)).toBe(true);
    }
  });

  it('keeps MCP admin definitions behind platform superadmin authorization', () => {
    expect(MCP_ADMIN_TOOLS.length).toBeGreaterThan(0);
    expect(
      MCP_ADMIN_TOOLS.every((tool) => tool.requiredRole === 'superadmin'),
    ).toBe(true);
  });

  it('keeps every definition module within the line budget', () => {
    const files = listToolModuleFiles(HERE);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(countLines(file), file).toBeLessThanOrEqual(MAX_MODULE_LINES);
    }
  });
});
