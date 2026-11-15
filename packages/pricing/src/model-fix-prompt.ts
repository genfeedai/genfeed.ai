import type {
  AdminModelPricingRow,
  ModelFixProblem,
  ModelFixPromptInput,
  ModelFixPromptItem,
  ModelFixPromptOptions,
} from '@genfeedai/contracts/interfaces';

const PROBLEM_ORDER: readonly ModelFixProblem[] = [
  'price-changed',
  'below-cost',
  'removed-by-provider',
  'new-draft',
  'unpriced',
  'unreadable',
  'data-error',
];

const PROBLEM_HEADING: Record<ModelFixProblem, string> = {
  'below-cost': 'Provider cost is above the sell price',
  'data-error': 'Data errors',
  'new-draft': 'New drafts',
  'price-changed': 'Price changed',
  'removed-by-provider': 'Removed by provider',
  unpriced: 'Unpriced',
  unreadable: 'Could not read the provider price',
};

const PROBLEM_FIX: Record<ModelFixProblem, string> = {
  'below-cost':
    'Urgent. Compute the sell price from the verified provider cost and the margin multiplier. If it is below cost, prepare the corrected approved rate.',
  'data-error':
    'The row points at an endpoint that is not a model on that provider. Find the right provider and endpoint, or prepare a retirement with a successor.',
  'new-draft':
    'Check the draft price, billing unit and category against the provider page. Prepare approval only when all three match. Otherwise prepare a rejection with the reason.',
  'price-changed':
    'Prepare approval of the new rate once the page confirms it. Show old and new per billing unit and the margin at the new rate.',
  'removed-by-provider':
    'Prepare retirement. Name the successor model; a retired model is never deleted.',
  unpriced:
    'Find the real provider price and prepare a reviewed rate with its source URL. If the provider publishes none, leave it inactive and say so.',
  unreadable:
    'Open the page, work out why the price could not be read, and prepare the rate by hand or a parser fix. Do not store a guessed price.',
};

const RULES = [
  'Never approve or store a price you did not read from the provider source yourself. Cite the URL.',
  'Never replace an approved rate with a scan result without comparing it to the source.',
  'A retired model keeps a successor and is never deleted.',
  'Read first, prepare second. Production writes (approve, retire, reject, seed) wait for the operator to type "go" in this conversation.',
  'Do not invent credits, copy a neighbour model, or use a category average.',
];

const AUDIT_STEPS = [
  'Run `genfeed admin pricing report --json` and keep the output.',
  'For every active model, open the provider source URL on its approved rate and read the current price for the same billing unit. Where the row has no source URL, find the provider page and say so.',
  'Compare each approved rate with the source. Mark it matches, changed (old and new per unit), unpriced, or removed by the provider.',
  'Recompute the margin for each priced model: sell price from the configured multiplier against the provider cost. List every model sold below cost.',
  'List models that are unpriced, removed by the provider, or whose provider and endpoint do not match.',
  'Prepare the fixes in one batch: rates to approve, models to retire with a successor, rows to correct. Make no change yet.',
];

const VERIFY_STEPS = [
  'Open the source URL and read the current price and billing unit. If there is no URL, find the provider page and cite it.',
  'Run `genfeed admin pricing report --json` and find the row by key. Compare its approved and pending rates with the page.',
  'Recompute the margin at the verified price and flag anything sold below cost.',
];

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function sortItems(items: ModelFixPromptItem[]): ModelFixPromptItem[] {
  return [...items].sort((a, b) => {
    const urgent = Number(b.isUrgent === true) - Number(a.isUrgent === true);
    if (urgent !== 0) return urgent;
    const problem =
      PROBLEM_ORDER.indexOf(a.problem) - PROBLEM_ORDER.indexOf(b.problem);
    return problem !== 0 ? problem : a.key.localeCompare(b.key);
  });
}

function itemLines(item: ModelFixPromptItem, index: number): string[] {
  const urgent = item.isUrgent ? 'URGENT: ' : '';
  const lines = [
    `${index}. ${urgent}${item.key} (${item.provider}, ${item.category}): ${item.detail}`,
  ];
  if (item.sourceUrl) lines.push(`   Source: ${item.sourceUrl}`);
  return lines;
}

function scopeTitle(input: ModelFixPromptInput): string {
  if (input.scope === 'audit-all') return 'Audit every model price';
  if (input.scope === 'scan-run') {
    return input.provider
      ? `Fix the models the ${input.provider} scan flagged`
      : 'Fix the models the scan flagged';
  }
  return 'Fix the models that need pricing attention';
}

function auditPrompt(input: ModelFixPromptInput): string {
  const lines = [
    `# ${scopeTitle(input)}`,
    '',
    'Repository: genfeedai/genfeed.ai. Goal: every active model has an approved rate that matches its provider source and sells above cost.',
    '',
    '## Rules',
    ...RULES.map((rule) => `- ${rule}`),
    '',
    '## Steps',
    ...AUDIT_STEPS.map((step, index) => `${index + 1}. ${step}`),
    '',
    '## Report back',
    '- A table: model, provider, approved rate, source rate, margin, verdict.',
    '- The batch of prepared fixes, grouped as approve, retire with successor, correct.',
    '- What you could not verify, and why.',
  ];
  if (input.adminUrl) lines.push('', `Admin models page: ${input.adminUrl}`);
  return lines.join('\n');
}

function fixPrompt(
  input: ModelFixPromptInput,
  options: ModelFixPromptOptions,
): string {
  const items = sortItems(input.items);
  const shown =
    options.maxItems !== undefined ? items.slice(0, options.maxItems) : items;
  const hidden = items.length - shown.length;
  const lines = [
    `# ${scopeTitle(input)}`,
    '',
    `Repository: genfeedai/genfeed.ai. ${plural(items.length, 'model')} need${items.length === 1 ? 's' : ''} action.`,
    '',
    '## Rules',
    ...RULES.map((rule) => `- ${rule}`),
    '',
    '## Models',
  ];
  let counter = 0;
  for (const problem of PROBLEM_ORDER) {
    const group = shown.filter((item) => item.problem === problem);
    if (group.length === 0) continue;
    lines.push('', `### ${PROBLEM_HEADING[problem]} (${group.length})`);
    for (const item of group) {
      counter += 1;
      lines.push(...itemLines(item, counter));
    }
  }
  if (hidden > 0) {
    lines.push(
      '',
      `And ${hidden} more. Run \`genfeed admin pricing report --attention --json\` for the full list.`,
    );
  }
  const problems = PROBLEM_ORDER.filter((problem) =>
    shown.some((item) => item.problem === problem),
  );
  lines.push(
    '',
    '## Verify each model',
    ...VERIFY_STEPS.map((s, i) => `${i + 1}. ${s}`),
  );
  lines.push(
    '',
    '## Prepare the fix',
    ...problems.map(
      (problem) => `- ${PROBLEM_HEADING[problem]}: ${PROBLEM_FIX[problem]}`,
    ),
    '',
    '## Report back',
    '- Per model: verified price with source URL, margin, and the exact change you prepared.',
    '- What you could not verify, and why.',
    '- Wait for the operator to type "go" before any production write.',
  );
  if (input.adminUrl) lines.push('', `Admin models page: ${input.adminUrl}`);
  return lines.join('\n');
}

/**
 * One prompt for an operator's agent, shared by the admin models page and the
 * Discord scan card. It tells the agent which models need action, how to check
 * each against its provider source, and that production writes wait for a go.
 */
export function buildModelFixPrompt(
  input: ModelFixPromptInput,
  options: ModelFixPromptOptions = {},
): string {
  if (input.scope === 'audit-all') return auditPrompt(input);
  if (input.items.length === 0) {
    return `# ${scopeTitle(input)}\n\nNothing needs action.`;
  }
  return fixPrompt(input, options);
}

function problemForRow(row: AdminModelPricingRow): ModelFixProblem {
  const codes = row.attention.map((item) => item.code);
  if (
    row.pendingRateChanges.length > 0 ||
    codes.includes('price_change_pending')
  )
    return 'price-changed';
  if (row.providerSyncFailureCode?.startsWith('rates_unavailable:'))
    return 'unreadable';
  if (codes.includes('refresh_failed') || codes.includes('refresh_stale'))
    return 'unreadable';
  return 'unpriced';
}

function rateChangeText(row: AdminModelPricingRow): string {
  return row.pendingRateChanges
    .map((change) => {
      const before =
        change.oldPriceUsd === null ? 'new' : `$${change.oldPriceUsd}`;
      const after =
        change.newPriceUsd === null ? 'gone' : `$${change.newPriceUsd}`;
      return `${change.variant || change.component} ${before} → ${after} per ${change.unit}`;
    })
    .join('; ');
}

/** Rows from the admin pricing report that need an operator, as prompt items. */
export function modelFixItemsFromPricingRows(
  rows: AdminModelPricingRow[],
): ModelFixPromptItem[] {
  return rows
    .filter((row) => row.attentionLevel !== null)
    .map((row) => {
      const reasons = row.attention.map((item) => item.reason).join(' · ');
      const changes = rateChangeText(row);
      return {
        category: row.category,
        detail: changes ? `${changes}. ${reasons}` : reasons,
        key: row.key,
        problem: problemForRow(row),
        provider: row.provider,
        sourceUrl: row.pending?.sourceUrl ?? row.reviewed?.sourceUrl ?? null,
      };
    });
}
