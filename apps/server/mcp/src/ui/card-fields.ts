import type {
  McpCard,
  McpCardFact,
  McpCardMetric,
} from '@mcp/shared/interfaces/mcp-app.interface';

const SEPARATORS_PATTERN = /[_-]/g;

/** Field readers and card shapes shared by every card view builder. */

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function text(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function safeCardUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

/** Credits and usage: two decimals at most, grouped by thousands. */
export function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(
    value,
  );
}

export function fact(label: string, value: unknown): McpCardFact[] {
  const shown =
    typeof value === 'number' && Number.isFinite(value)
      ? formatAmount(value)
      : typeof value === 'string'
        ? value.trim()
        : '';
  return shown ? [{ label, value: shown }] : [];
}

export function words(value: string): string {
  const spaced = value.replace(SEPARATORS_PATTERN, ' ').toLowerCase();
  return `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`;
}

export function summaryCard(
  title: string,
  facts: McpCardFact[],
  extra: Partial<McpCard> = {},
): McpCard {
  return {
    date: '',
    description: '',
    id: '',
    kind: 'summary',
    platform: '',
    status: '',
    title,
    ...extra,
    facts,
  };
}

export function metric(
  label: string,
  value: unknown,
  extra: Partial<McpCardMetric> = {},
): McpCardMetric[] {
  return typeof value === 'number' && Number.isFinite(value)
    ? [{ label, value: formatAmount(value), ...extra }]
    : [];
}

const CHANNEL_LABELS: Readonly<Record<string, string>> = {
  discord: 'Discord',
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
  reddit: 'Reddit',
  telegram: 'Telegram',
  threads: 'Threads',
  tiktok: 'TikTok',
  twitch: 'Twitch',
  twitter: 'X',
  x: 'X',
  youtube: 'YouTube',
};

/** A channel's display name: the API's own label, else a known brand spelling. */
export function channelLabel(platform: string, label = ''): string {
  return (
    label ||
    CHANNEL_LABELS[platform.toLowerCase()] ||
    words(platform) ||
    'Channel'
  );
}

export function utcStamp(value: string): string {
  const time = Date.parse(value);
  return Number.isNaN(time)
    ? ''
    : `${new Date(time).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function rows(value: unknown): Record<string, unknown>[] {
  return (Array.isArray(value) ? value : []).map(record);
}
