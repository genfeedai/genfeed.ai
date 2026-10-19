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

const HARNESS_SOURCES: Readonly<Record<string, string>> = {
  brand: 'brand setting',
  default: 'default',
  organization: 'organization setting',
  request: 'this call',
};

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/**
 * Announces what a generation actually sent to the provider, so clients that
 * show only text content still see it. Identifiers, Knowledge and learning
 * receipts stay in structuredContent.
 */
export function harnessReceiptText(payload: unknown): string | undefined {
  const receipt = isRecord(payload) ? payload.generationHarness : undefined;
  if (!isRecord(receipt)) return undefined;
  const sent = text(receipt.enhancedPrompt);
  if (!sent) return undefined;
  const isApplied = receipt.status === 'applied';
  const source = HARNESS_SOURCES[String(receipt.source)];
  const packs = (
    Array.isArray(receipt.appliedPacks) ? receipt.appliedPacks : []
  )
    .flatMap((pack) =>
      isRecord(pack) && text(pack.id)
        ? [`${pack.id}${text(pack.version) ? ` ${pack.version}` : ''}`]
        : [],
    )
    .join(', ');
  const original = text(receipt.originalPrompt);
  return [
    `Prompt enhancement: ${isApplied ? 'applied' : 'skipped'}${source ? ` (${source})` : ''}`,
    isApplied ? 'Prompt sent to the model:' : 'Prompt sent unchanged:',
    sent,
    ...(isApplied && original && original !== sent
      ? ['Your original prompt:', original]
      : []),
    ...(packs ? [`Applied packs: ${packs}`] : []),
  ].join('\n');
}

export function dataToolResult(data: unknown, label?: string) {
  const body = [formatToolData(data), harnessReceiptText(data)]
    .filter(Boolean)
    .join('\n\n');
  return {
    content: [
      { type: 'text' as const, text: label ? `${label}\n\n${body}` : body },
    ],
    structuredContent: { data },
  };
}

const BRAND_NAMES_SHOWN = 8;

/** Which brands the caller can use, or how to get one when there are none. */
function brandLines(
  profile: Record<string, unknown>,
  brandsUrl: string | undefined,
): string[] {
  if (typeof profile.brandCount !== 'number') return [];
  if (profile.brandCount === 0)
    return [
      `Brands: none yet. Generation needs a brand: create one in Genfeed${
        brandsUrl ? ` (${brandsUrl})` : ''
      } or ask an organization admin.`,
    ];
  const names = (Array.isArray(profile.brands) ? profile.brands : [])
    .flatMap((brand) =>
      isRecord(brand) && typeof brand.name === 'string' && brand.name
        ? [brand.name]
        : [],
    )
    .slice(0, BRAND_NAMES_SHOWN);
  if (names.length === 0) return [`Brands: ${profile.brandCount}`];
  const remaining = profile.brandCount - names.length;
  return [
    `Brands (${profile.brandCount}): ${names.join(', ')}${
      remaining > 0 ? `, and ${remaining} more` : ''
    }`,
  ];
}

export function accountToolText(
  value: unknown,
  options: { brandsUrl?: string } = {},
): string {
  const data = isRecord(value) ? value : {};
  const profile = isRecord(data.profile) ? data.profile : undefined;
  const credits = isRecord(data.credits) ? data.credits : undefined;
  const usage = isRecord(data.usage) ? data.usage : undefined;
  const lines: string[] = [];
  if (profile) {
    lines.push('Connected to Genfeed.');
    if (
      typeof profile.organizationName === 'string' &&
      profile.organizationName
    )
      lines.push(`Organization: ${profile.organizationName}`);
    if (typeof profile.role === 'string')
      lines.push(`Role: ${readableLabel(profile.role)}`);
    if (typeof profile.brandName === 'string' && profile.brandName)
      lines.push(`Active brand: ${profile.brandName}`);
    lines.push(...brandLines(profile, options.brandsUrl));
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
