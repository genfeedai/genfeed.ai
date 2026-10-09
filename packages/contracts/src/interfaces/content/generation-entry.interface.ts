/** Entry channel is descriptive provenance and never grants permissions. */
export enum GenerationEntryChannel {
  WEB = 'web',
  DESKTOP = 'desktop',
  MCP = 'mcp',
  API = 'api',
  UNKNOWN = 'unknown',
}

export enum GenerationEntryAttribution {
  CLIENT_REPORTED = 'client_reported',
  SERVER_VERIFIED = 'server_verified',
  UNKNOWN = 'unknown',
}

export interface GenerationEntry {
  channel: GenerationEntryChannel;
  attribution: GenerationEntryAttribution;
}

export const GENERATION_ENTRY_HEADER = 'x-genfeed-generation-client';

/** Strict projection: additional provider/identity fields never cross the wire. */
export function parseGenerationEntry(
  value: unknown,
): GenerationEntry | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const entry = value as Record<string, unknown>;
  const channel = entry.channel;
  const attribution = entry.attribution;
  if (
    ((channel === GenerationEntryChannel.WEB ||
      channel === GenerationEntryChannel.DESKTOP) &&
      attribution === GenerationEntryAttribution.CLIENT_REPORTED) ||
    ((channel === GenerationEntryChannel.API ||
      channel === GenerationEntryChannel.MCP) &&
      attribution === GenerationEntryAttribution.SERVER_VERIFIED) ||
    (channel === GenerationEntryChannel.UNKNOWN &&
      attribution === GenerationEntryAttribution.UNKNOWN)
  )
    return { channel, attribution };
  return undefined;
}
