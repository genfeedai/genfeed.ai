import { describe, expect, it } from 'vitest';
import { summarizeAgentToolResult } from './summarize-agent-tool-result';

describe('summarizeAgentToolResult', () => {
  it('turns an asset list into a count', () => {
    expect(
      summarizeAgentToolResult({
        assets: [
          {
            category: 'IMAGE',
            createdAt: '2026-10-06',
            prompt: 'a portrait',
          },
        ],
        count: 1,
        type: 'image',
      }),
    ).toBe('1 image');
    expect(
      summarizeAgentToolResult({ assets: [], count: 0, type: 'video' }),
    ).toBe('No videos');
    expect(
      summarizeAgentToolResult({ assets: [], count: 0, type: 'music' }),
    ).toBe('No music');
    expect(
      summarizeAgentToolResult({ assets: [{}, {}], count: 2, type: 'avatar' }),
    ).toBe('2 avatars');
    expect(
      summarizeAgentToolResult({
        assets: [{ id: 'a' }],
        count: 1,
        type: 'music',
      }),
    ).toBe('1 music file');
  });

  it('names the current brand and the tool catalog', () => {
    expect(
      summarizeAgentToolResult({
        currentBrand: {
          description: 'Publish content every day',
          id: 'brand-1',
          label: 'Genfeed',
          name: 'Genfeed',
          text: 'A long voice guide',
        },
      }),
    ).toBe('Genfeed');
    expect(
      summarizeAgentToolResult({
        availableFilters: { categories: ['ads', 'admin'] },
        returned: 20,
        tools: Array.from({ length: 20 }, () => ({ name: 'tool' })),
        total: 48,
      }),
    ).toBe('20 of 48 tools');
    expect(
      summarizeAgentToolResult({
        returned: 3,
        tools: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
        total: 3,
      }),
    ).toBe('3 tools');
  });

  it('summarizes review counts without the payload body', () => {
    const details = 'x'.repeat(1000);
    expect(
      summarizeAgentToolResult({
        approvedCount: 0,
        changesRequestedCount: 0,
        details,
        pendingCount: 0,
        readyCount: 0,
        recentItems: [],
      }),
    ).toBe('Nothing waiting for review');
    expect(
      summarizeAgentToolResult({
        approvedCount: 4,
        changesRequestedCount: 0,
        pendingCount: 2,
        readyCount: 1,
      }),
    ).toBe('2 pending, 1 ready, 4 approved');
    expect(summarizeAgentToolResult({ totalPending: 0 })).toBe(
      'Nothing waiting for review',
    );
  });

  it('reads a stored JSON string and leaves plain sentences alone', () => {
    expect(
      summarizeAgentToolResult(
        JSON.stringify({ assets: [], count: 0, type: 'video' }),
      ),
    ).toBe('No videos');
    expect(summarizeAgentToolResult('Found 5 results')).toBe('Found 5 results');
    expect(summarizeAgentToolResult('Voice: bold')).toBe('Voice: bold');
    expect(summarizeAgentToolResult('OK')).toBe('');
    expect(summarizeAgentToolResult('Done')).toBe('');
    expect(summarizeAgentToolResult('{not json')).toBe('');
  });

  it('does not dump an unrecognized object', () => {
    const summary = summarizeAgentToolResult({
      campaignId: 'campaign-1',
      confirmationPrompt: 'secret-nonce-please-confirm',
      pendingConfirmation: true,
      sourceActionId: 'campaign-transition-1',
    });
    expect(summary).toBe('');
    expect(summary).not.toContain('{');
    expect(summary).not.toContain('secret-nonce');
  });

  it('uses a status or a name when that is the useful field', () => {
    expect(
      summarizeAgentToolResult({
        id: 'asset-1',
        kind: 'image',
        status: 'GENERATED',
        url: 'https://cdn.example/asset-1.png',
      }),
    ).toBe('Image generated');
    expect(summarizeAgentToolResult({ characters: [{ handle: 'ada' }] })).toBe(
      '1 character',
    );
  });
});
