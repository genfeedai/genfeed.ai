import { PLATFORM_COLORS } from '@genfeedai/contracts/constants';
import {
  AnthropicIcon,
  OpenAiIcon,
  XaiIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import { getPlatformIconComponent } from '@genfeedai/helpers/ui/platform-icon/platform-icon.helper';
import type {
  ConnectionAgent,
  ConnectionBrand,
} from '@genfeedai/props/ui/feedback/connection-success.props';
import { PlugZap } from 'lucide-react';

/** Marks drawn in black or white by their owners; they follow the theme foreground. */
const MONOCHROME_PLATFORMS = new Set(['devto', 'threads', 'tiktok', 'twitter']);

const PLATFORM_ALIASES: Record<string, string> = { x: 'twitter' };

const AGENT_BRANDS: Record<ConnectionAgent, ConnectionBrand> = {
  chatgpt: { Icon: OpenAiIcon, name: 'ChatGPT' },
  claude: { color: '#D97757', Icon: AnthropicIcon, name: 'Claude' },
  codex: { Icon: OpenAiIcon, name: 'Codex' },
  cursor: { Icon: PlugZap, name: 'Cursor' },
  generic: { Icon: PlugZap, name: 'MCP client' },
  grok: { Icon: XaiIcon, name: 'Grok' },
};

function toTitleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Brand for a social platform, keyed by `CredentialPlatform` value or OAuth
 * service path (`instagram`, `google-ads`, `x`). Unknown platforms keep their
 * name and fall back to a neutral connection glyph.
 */
export function resolvePlatformConnectionBrand(
  platform: string,
): ConnectionBrand {
  const normalized = platform.trim().toLowerCase().replaceAll('-', '_');
  const key = PLATFORM_ALIASES[normalized] ?? normalized;
  const palette = PLATFORM_COLORS[key as keyof typeof PLATFORM_COLORS];

  return {
    color: palette && !MONOCHROME_PLATFORMS.has(key) ? palette.base : undefined,
    Icon: getPlatformIconComponent(key) ?? PlugZap,
    name: key === 'twitter' ? 'X' : (palette?.name ?? toTitleCase(platform)),
  };
}

export function resolveAgentConnectionBrand(
  agent: ConnectionAgent,
): ConnectionBrand {
  return AGENT_BRANDS[agent];
}

/** Maps a dynamically registered OAuth client name to the agent it belongs to. */
export function resolveConnectionAgent(
  clientName: string | null | undefined,
): ConnectionAgent {
  const name = clientName?.toLowerCase() ?? '';

  if (name.includes('claude') || name.includes('anthropic')) {
    return 'claude';
  }
  if (name.includes('codex')) {
    return 'codex';
  }
  if (name.includes('chatgpt') || name.includes('openai')) {
    return 'chatgpt';
  }
  if (name.includes('cursor')) {
    return 'cursor';
  }
  if (name.includes('grok') || name.includes('xai')) {
    return 'grok';
  }
  return 'generic';
}
