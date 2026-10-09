import { describe, expect, it } from 'vitest';
import {
  GenerationEntryAttribution,
  GenerationEntryChannel,
  parseGenerationEntry,
} from './generation-entry.interface';

describe('generation entry projection', () => {
  it.each([
    [GenerationEntryChannel.WEB, GenerationEntryAttribution.CLIENT_REPORTED],
    [
      GenerationEntryChannel.DESKTOP,
      GenerationEntryAttribution.CLIENT_REPORTED,
    ],
    [GenerationEntryChannel.MCP, GenerationEntryAttribution.SERVER_VERIFIED],
    [GenerationEntryChannel.API, GenerationEntryAttribution.SERVER_VERIFIED],
    [GenerationEntryChannel.UNKNOWN, GenerationEntryAttribution.UNKNOWN],
  ])('projects only channel and attribution for %s', (channel, attribution) => {
    expect(
      parseGenerationEntry({
        channel,
        attribution,
        apiKey: 'private',
        actorUserId: 'not-source-authority',
      }),
    ).toEqual({ channel, attribution });
  });
  it.each([
    undefined,
    null,
    [],
    {},
    { channel: 'desktop', attribution: 'server_verified' },
    { channel: 'mcp', attribution: 'client_reported' },
    { channel: 'web', attribution: 'unknown' },
    { channel: 'legacy', attribution: 'unknown' },
  ])('rejects malformed or contradictory entry %j', (value) => {
    expect(parseGenerationEntry(value)).toBeUndefined();
  });
});
