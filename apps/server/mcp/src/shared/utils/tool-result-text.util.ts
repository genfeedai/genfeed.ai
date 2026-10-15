import { isRecord } from '@genfeedai/utils/data/extract.util';

const MAX_ITEMS = 24;
const MAX_DEPTH = 6;
const ID_FIELD = /(?:^|[ _-])ids?$|^uuid$/i;
const PRIVATE_FIELD =
  /token$|secret|password|^authorization$|^authorizationCode$|credentials|^headers$|^uploadUrl$|cursor|^generationHarness$/i;
const LABELS: Readonly<Record<string, string>> = {
  currentBalance: 'Credits available',
  isOnboardingCompleted: 'Account setup complete',
  trendPercentage: 'Usage change (%)',
  usage7Days: 'Credits used in the last 7 days',
  usage30Days: 'Credits used in the last 30 days',
};

export function readableLabel(key: string): string {
  const label =
    LABELS[key] ??
    key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function scalar(value: unknown): string {
  if (value === null) return 'Unavailable';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number')
    return Number.isFinite(value)
      ? String(Number(value.toPrecision(15)))
      : 'Unavailable';
  return typeof value === 'string' ? value : '';
}

function fields(value: unknown, depth: number): string {
  if (depth > MAX_DEPTH)
    return 'Additional details are available in the structured result.';
  if (Array.isArray(value)) {
    if (!value.length) return 'None found.';
    const rows = value
      .slice(0, MAX_ITEMS)
      .map((item) => fields(item, depth + 1))
      .filter(Boolean);
    const remaining = value.length - MAX_ITEMS;
    return (
      rows.map((row) => `- ${row.replaceAll('\n', '\n  ')}`).join('\n') +
      (remaining > 0
        ? `\n… ${remaining} more; request the next page for more results.`
        : '')
    );
  }
  if (!isRecord(value)) return scalar(value);
  return Object.entries(value)
    .flatMap(([key, item]) => {
      if (
        ID_FIELD.test(key.replace(/([a-z0-9])([A-Z])/g, '$1_$2')) ||
        PRIVATE_FIELD.test(key) ||
        item === undefined
      )
        return [];
      if (/url$/i.test(key) && typeof item === 'string') {
        try {
          const url = new URL(item);
          if (
            ['https:', 'http:'].includes(url.protocol) &&
            !url.username &&
            !url.password
          )
            return [
              `[Open ${
                readableLabel(key)
                  .replace(/ ?url$/i, '')
                  .toLowerCase() || 'link'
              }](${url.href.replaceAll('(', '%28').replaceAll(')', '%29')})`,
            ];
        } catch {
          /* Invalid links have no display action. */
        }
        return [];
      }
      const rendered = fields(item, depth + 1);
      if (!rendered) return [];
      const display =
        /^(status|state|executionState|role)$/.test(key) &&
        typeof item === 'string'
          ? readableLabel(item.toLowerCase())
          : rendered;
      return [
        isRecord(item) || (Array.isArray(item) && item.length)
          ? `${readableLabel(key)}:\n${display.replaceAll(/^/gm, '  ')}`
          : `${readableLabel(key)}: ${display}`,
      ];
    })
    .join('\n');
}

/** Display text is a summary. Identifiers and complete payloads stay in structuredContent. */
export function formatToolData(value: unknown): string {
  return fields(value, 0) || 'No additional details returned.';
}

export function dataToolResult(data: unknown, label?: string) {
  const body = formatToolData(data);
  return {
    content: [
      { type: 'text' as const, text: label ? `${label}\n\n${body}` : body },
    ],
    structuredContent: { data },
  };
}

export function accountToolText(value: unknown): string {
  const data = isRecord(value) ? value : {};
  const profile = isRecord(data.profile) ? data.profile : undefined;
  const credits = isRecord(data.credits) ? data.credits : undefined;
  const usage = isRecord(data.usage) ? data.usage : undefined;
  const lines: string[] = [];
  if (profile) {
    lines.push('Connected to Genfeed.');
    if (typeof profile.role === 'string')
      lines.push(`Role: ${readableLabel(profile.role)}`);
    if (typeof profile.isOnboardingCompleted === 'boolean')
      lines.push(
        `Account setup: ${profile.isOnboardingCompleted ? 'Complete' : 'Incomplete'}`,
      );
  }
  if (credits)
    lines.push(
      `Credits available: ${scalar(credits.balance ?? credits.currentBalance ?? null)}`,
    );
  if (usage) {
    const metrics = credits
      ? Object.fromEntries(
          Object.entries(usage).filter(([key]) => key !== 'currentBalance'),
        )
      : usage;
    lines.push(formatToolData(metrics));
  }
  return lines.join('\n') || 'Account details are unavailable.';
}
