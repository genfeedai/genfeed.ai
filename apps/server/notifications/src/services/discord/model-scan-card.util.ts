import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  IOperatorCardInput,
  ModelFixPromptInput,
  ModelFixPromptItem,
  ModelPricingRateChange,
  ModelScanProvider,
  ModelScanReport,
} from '@genfeedai/contracts/interfaces';

const PROVIDER_NAMES: Record<ModelScanProvider, string> = {
  fal: 'fal.ai',
  replicate: 'Replicate',
};

const COLOR_URGENT = 0xef4444;
const COLOR_ATTENTION = 0xffa500;
const COLOR_INFO = 0x5865f2;

// Discord caps one message at 6,000 characters across every embed part. The
// groups get a fixed share, the fix prompt gets what is left, and a margin
// covers field names, the title and the footer.
const MESSAGE_LIMIT = 6000;
const DESCRIPTION_LIMIT = 4096;
const GROUP_VALUE_LIMIT = 450;
const GROUP_MAX_LINES = 4;
const MESSAGE_MARGIN = 400;
const CODE_FENCE = '```';
const FOOTER =
  'The approved rate keeps charging until an operator approves a change.';

/** True when the run found nothing an operator has to act on. */
function isModelScanReportEmpty(report: ModelScanReport): boolean {
  return (
    report.priceChanges.length === 0 &&
    report.removedByProvider.length === 0 &&
    report.delisted.length === 0 &&
    report.newDrafts.length === 0 &&
    report.unreadable.length === 0 &&
    report.dataErrors.length === 0
  );
}

/** The admin models page, or null when the app origin is not configured. */
export function adminModelsUrl(appUrl: string | undefined): string | null {
  return appUrl ? `${appUrl}${APP_ROUTES.ADMIN.AUTOMATION.MODELS}` : null;
}

function formatPrice(value: number | null): string {
  return value === null
    ? 'none'
    : `$${value.toLocaleString('en-US', { maximumFractionDigits: 10 })}`;
}

function describeChange(change: ModelPricingRateChange): string {
  return `${change.variant}: ${formatPrice(change.oldPriceUsd)} → ${formatPrice(change.newPriceUsd)} per ${change.unit}`;
}

/**
 * Joins lines until the next one would pass `limit`, then says how many were
 * left out. The first line is always kept, cut to fit if it must be.
 */
function fitLines(lines: string[], limit: number, noun: string): string {
  const reserve = 24; // room for "and 99 more <noun>"
  const kept: string[] = [];
  let length = 0;
  for (const line of lines.slice(0, GROUP_MAX_LINES)) {
    if (kept.length > 0 && length + line.length + 1 + reserve > limit) break;
    kept.push(line);
    length += line.length + 1;
  }
  const hidden = lines.length - kept.length;
  if (hidden > 0) kept.push(`and ${hidden} more ${noun}`);
  const value = kept.join('\n');
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}

function priceChangeLines(report: ModelScanReport): string[] {
  // Urgent changes lead: they lose money on every run until approved.
  const sorted = [...report.priceChanges].sort(
    (a, b) => Number(b.isUrgent) - Number(a.isUrgent),
  );
  return sorted.map((entry) => {
    const [first, ...rest] = entry.changes;
    const detail = first
      ? `${describeChange(first)}${rest.length > 0 ? ` (+${rest.length} more)` : ''}`
      : 'billing rules changed';
    const prefix = entry.isUrgent ? '🔴 ' : '';
    const reason =
      entry.isUrgent && entry.urgentReason ? ` — ${entry.urgentReason}` : '';
    return `${prefix}**${entry.modelKey}** ${detail}${reason}`;
  });
}

function newDraftLines(report: ModelScanReport): string[] {
  return report.newDrafts.map((draft) => {
    const price =
      draft.providerCostUsd === null
        ? `unpriced${draft.unpricedReason ? ` (${draft.unpricedReason})` : ''}`
        : `${formatPrice(draft.providerCostUsd)}${draft.billingUnit ? ` per ${draft.billingUnit}` : ''}`;
    return `**${draft.modelKey}** ${draft.category}, ${price}`;
  });
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function summarize(report: ModelScanReport): string {
  const parts: string[] = [];
  const urgent = report.priceChanges.filter((entry) => entry.isUrgent).length;
  if (report.priceChanges.length > 0)
    parts.push(
      `${countLabel(report.priceChanges.length, 'price change', 'price changes')}${urgent > 0 ? ` (${urgent} urgent)` : ''}`,
    );
  if (report.removedByProvider.length > 0)
    parts.push(`${report.removedByProvider.length} removed by provider`);
  if (report.delisted.length > 0)
    parts.push(`${report.delisted.length} delisted`);
  if (report.newDrafts.length > 0) parts.push(`${report.newDrafts.length} new`);
  if (report.unreadable.length > 0)
    parts.push(`${report.unreadable.length} unreadable`);
  if (report.dataErrors.length > 0)
    parts.push(
      countLabel(report.dataErrors.length, 'data error', 'data errors'),
    );
  return parts.join(', ');
}

function countItems(report: ModelScanReport): number {
  return (
    report.priceChanges.length +
    report.removedByProvider.length +
    report.delisted.length +
    report.newDrafts.length +
    report.unreadable.length +
    report.dataErrors.length
  );
}

/** The report as items for the shared fix prompt generator. */
export function modelScanFixPromptInput(
  report: ModelScanReport,
  adminUrl: string | null,
): ModelFixPromptInput {
  const provider = PROVIDER_NAMES[report.provider];
  const items: ModelFixPromptItem[] = [
    ...report.priceChanges.map(
      (entry): ModelFixPromptItem => ({
        category: 'unknown',
        detail: `${
          entry.changes.length > 0
            ? entry.changes.map(describeChange).join('; ')
            : 'billing rules changed'
        }${entry.urgentReason ? `. ${entry.urgentReason}` : ''}`,
        isUrgent: entry.isUrgent,
        key: entry.modelKey,
        problem: 'price-changed',
        provider,
        sourceUrl: entry.sourceUrl,
      }),
    ),
    ...report.removedByProvider.map(
      (entry): ModelFixPromptItem => ({
        category: 'unknown',
        detail: entry.reason,
        key: entry.modelKey,
        problem: 'removed-by-provider',
        provider,
        sourceUrl: entry.sourceUrl,
      }),
    ),
    ...report.delisted.map(
      (entry): ModelFixPromptItem => ({
        category: 'unknown',
        detail: `delisted, the API still serves it: ${entry.reason}`,
        key: entry.modelKey,
        problem: 'removed-by-provider',
        provider,
        sourceUrl: entry.sourceUrl,
      }),
    ),
    ...report.newDrafts.map(
      (entry): ModelFixPromptItem => ({
        category: entry.category,
        detail:
          entry.providerCostUsd === null
            ? `unpriced${entry.unpricedReason ? ` (${entry.unpricedReason})` : ''}`
            : `${formatPrice(entry.providerCostUsd)}${entry.billingUnit ? ` per ${entry.billingUnit}` : ''}`,
        key: entry.modelKey,
        problem: 'new-draft',
        provider,
        sourceUrl: entry.sourceUrl,
      }),
    ),
    ...report.unreadable.map(
      (entry): ModelFixPromptItem => ({
        category: 'unknown',
        detail: `${entry.code}: ${entry.reason}`,
        key: entry.modelKey,
        problem: 'unreadable',
        provider,
      }),
    ),
    ...report.dataErrors.map(
      (entry): ModelFixPromptItem => ({
        category: 'unknown',
        detail: entry.reason,
        key: entry.modelKey,
        problem: 'data-error',
        provider,
      }),
    ),
  ];
  return { adminUrl, items, provider, scope: 'scan-run' };
}

/** The prompt in a code block, cut to fit `limit` characters in all. */
function codeBlock(prompt: string, limit: number): string {
  const safe = prompt.replaceAll(CODE_FENCE, "'''").trim();
  const room = Math.max(limit - CODE_FENCE.length * 2 - 2, 0);
  const body = safe.length > room ? `${safe.slice(0, room - 3)}...` : safe;
  return `${CODE_FENCE}\n${body}\n${CODE_FENCE}`;
}

/**
 * The one Discord card for a provider scan: price changes first (urgent ones on
 * top), then removed, new, unreadable and data errors, each only when it has
 * rows, then the Fix it prompt in a code block. Returns null when the run found
 * nothing, so no card is sent.
 *
 * `promptFor(maxItems)` returns the fix prompt listing at most that many
 * models. The card keeps the longest one that fits Discord's message limit.
 */
export function buildModelScanCard(
  report: ModelScanReport,
  options: {
    adminUrl: string | null;
    promptFor: (maxItems: number) => string;
  },
): IOperatorCardInput | null {
  if (isModelScanReportEmpty(report)) return null;
  const hasUrgent = report.priceChanges.some((entry) => entry.isUrgent);
  const color = hasUrgent
    ? COLOR_URGENT
    : report.priceChanges.length > 0 ||
        report.removedByProvider.length > 0 ||
        report.delisted.length > 0
      ? COLOR_ATTENTION
      : COLOR_INFO;

  const fields: NonNullable<IOperatorCardInput['fields']> = [];
  const addGroup = (name: string, lines: string[], noun: string): void => {
    if (lines.length === 0) return;
    fields.push({
      inline: false,
      name,
      value: fitLines(lines, GROUP_VALUE_LIMIT, noun),
    });
  };
  addGroup('Price changes', priceChangeLines(report), 'models');
  addGroup(
    'Delisted (API still serves it)',
    report.delisted.map((entry) => `**${entry.modelKey}** ${entry.reason}`),
    'models',
  );
  addGroup(
    'Removed by provider',
    report.removedByProvider.map(
      (entry) => `**${entry.modelKey}** ${entry.reason}`,
    ),
    'models',
  );
  addGroup('New on the provider', newDraftLines(report), 'models');
  addGroup(
    'Could not read',
    report.unreadable.map((entry) => `**${entry.modelKey}** ${entry.reason}`),
    'models',
  );
  addGroup(
    'Data errors',
    report.dataErrors.map((entry) => `**${entry.modelKey}** ${entry.reason}`),
    'rows',
  );

  const summary = summarize(report);
  const used =
    summary.length +
    FOOTER.length +
    fields.reduce((total, field) => total + field.value.length, 0) +
    MESSAGE_MARGIN;
  const room = Math.min(
    MESSAGE_LIMIT - used,
    DESCRIPTION_LIMIT - summary.length - 1,
  );
  let prompt = '';
  for (let maxItems = countItems(report); maxItems >= 0; maxItems -= 1) {
    prompt = options.promptFor(maxItems);
    if (prompt.length + CODE_FENCE.length * 2 + 2 <= room) break;
  }

  return {
    ...(options.adminUrl
      ? { action: { label: 'Open models in admin', url: options.adminUrl } }
      : {}),
    color,
    fields,
    footer: FOOTER,
    summary: `${summary}\n${codeBlock(prompt, room)}`,
    title: `Model scan: ${PROVIDER_NAMES[report.provider]}`,
  };
}
