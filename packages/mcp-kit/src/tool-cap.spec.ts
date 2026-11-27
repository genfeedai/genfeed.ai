import { describe, expect, it } from 'vitest';
import { assertMcpToolCap, MCP_TOOL_CAP } from './tool-cap';

describe('tool cap', () => {
  it('holds the listing at 30 tools', () => {
    expect(MCP_TOOL_CAP).toBe(30);
    expect(() => assertMcpToolCap(30)).not.toThrow();
    expect(() => assertMcpToolCap(31)).toThrow(
      'MCP catalog exceeds the 30-tool cap: lists 31',
    );
  });

  it('checks a narrower cap a connector sets for itself', () => {
    expect(() => assertMcpToolCap(15, 15)).not.toThrow();
    expect(() => assertMcpToolCap(16, 15)).toThrow('15-tool cap');
  });
});
