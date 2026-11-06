/**
 * Body builders for each system email that carries more than copy: the content
 * recap, the ready-to-publish reminder, generation results, credit alerts and
 * receipts, the lifecycle path, workflow results and the Skills Pro receipt.
 *
 * Each returns `bodyHtml` for `buildSystemEmailHtml`. They are pure: callers
 * pass finished numbers and hosted image URLs, nothing here reads a database or
 * the environment, so the same functions render the live emails and the
 * prototype in `docs/emails/`.
 */

import {
  buildSystemEmailParagraph,
  escapeSystemEmailHtml,
} from './system-email.helper';
import {
  buildEmailBigNumber,
  buildEmailCallout,
  buildEmailCodeBlock,
  buildEmailEyebrow,
  buildEmailHero,
  buildEmailKeyValueRows,
  buildEmailPill,
  buildEmailStatRow,
  buildEmailSteps,
  buildEmailThumbnailGrid,
  type EmailStat,
  type EmailStep,
  type EmailThumbnail,
  type EmailTone,
} from './system-email-blocks.helper';

const UNAVAILABLE = 'Unavailable';

function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

export interface ContentRecapEmailInput {
  period: 'day' | 'week';
  /** "2026-10-26 to 2026-11-01 (UTC)". */
  periodRange: string;
  generated: number;
  published: number;
  creditsUsed: number;
  /** Measured views and interactions of the published pieces; absent without analytics. */
  views?: number | null;
  interactions?: number | null;
  /** Previews of what was created, newest first. */
  items: readonly EmailThumbnail[];
  /** Pieces created beyond `items`. */
  moreCount?: number;
  /** A brand in the period has no connected publishing account. */
  hasMissingConnection: boolean;
}

/** Counters, previews of what was created and, when measured, how it performed. */
export function buildContentRecapEmailBody(
  input: ContentRecapEmailInput,
): string {
  const ready = Math.max(0, input.generated - input.published);
  const periodWord = input.period === 'week' ? 'this week' : 'today';
  const stats: EmailStat[] = [
    { label: 'Created', value: formatCount(input.generated) },
    {
      label: 'Published',
      tone: input.published > 0 ? 'success' : 'neutral',
      value: formatCount(input.published),
    },
    {
      label: 'Ready to publish',
      tone: ready > 0 ? 'warning' : 'neutral',
      value: formatCount(ready),
    },
    { label: 'Credits used', value: formatCount(input.creditsUsed) },
  ];
  const hasPerformance =
    input.published > 0 &&
    (input.views !== undefined || input.interactions !== undefined);
  const performance = hasPerformance
    ? buildEmailEyebrow('Performance of published pieces') +
      buildEmailStatRow([
        {
          label: 'Views',
          value:
            input.views === null || input.views === undefined
              ? UNAVAILABLE
              : formatCount(input.views),
        },
        {
          label: 'Interactions',
          value:
            input.interactions === null || input.interactions === undefined
              ? UNAVAILABLE
              : formatCount(input.interactions),
        },
      ])
    : '';
  const grid = input.items.length
    ? buildEmailEyebrow(`Created ${periodWord}`) +
      buildEmailThumbnailGrid(input.items, { moreCount: input.moreCount })
    : '';
  const callout = input.hasMissingConnection
    ? buildEmailCallout({
        body: 'Connect a destination to share what you created.',
        title: 'Some content has no publishing account yet',
        tone: 'warning',
      })
    : '';
  return [
    buildEmailEyebrow(input.periodRange),
    buildEmailStatRow(stats),
    grid,
    performance,
    callout,
  ].join('');
}

export interface PublishingConnectionEmailInput {
  brandLabel: string;
  waitingCount: number;
  items: readonly EmailThumbnail[];
}

/** The pieces that are finished and have nowhere to go. */
export function buildPublishingConnectionEmailBody(
  input: PublishingConnectionEmailInput,
): string {
  const noun = input.waitingCount === 1 ? 'piece' : 'pieces';
  return [
    buildEmailStatRow([
      {
        hint: input.brandLabel,
        label: `${noun} waiting for a destination`,
        tone: 'warning',
        value: formatCount(input.waitingCount),
      },
    ]),
    buildEmailThumbnailGrid(input.items, {
      moreCount: input.waitingCount - Math.min(input.items.length, 6),
    }),
    buildSystemEmailParagraph(
      'Connect an account to review and publish it from Genfeed.',
    ),
  ].join('');
}

export interface GenerationEmailInput {
  isFailed: boolean;
  imageUrl?: string | null;
  kind: EmailThumbnail['kind'];
  brandLabel?: string;
  /** Why it failed, when the provider reported one. */
  failureReason?: string;
}

/** The finished piece as a hero preview, or the failure with what to do next. */
export function buildGenerationEmailBody(input: GenerationEmailInput): string {
  if (input.isFailed) {
    return [
      buildEmailCallout({
        body:
          input.failureReason ?? 'Open the asset to review it and try again.',
        title: 'This generation could not finish',
        tone: 'danger',
      }),
    ].join('');
  }
  return [
    buildEmailHero({
      imageUrl: input.imageUrl,
      kind: input.kind,
      meta: input.brandLabel,
    }),
    buildSystemEmailParagraph(
      'Your generation has finished. Open the asset to review it and prepare it for publishing.',
    ),
  ].join('');
}

export interface CreditAlertEmailInput {
  isExhausted: boolean;
  spendable: number;
}

/** The balance as one large figure, red when it has run out. */
export function buildCreditAlertEmailBody(
  input: CreditAlertEmailInput,
): string {
  return [
    buildEmailBigNumber({
      caption: 'available after current generation reservations',
      label: 'Credits left',
      tone: input.isExhausted ? 'danger' : 'warning',
      value: formatCount(Math.max(0, input.spendable)),
    }),
    buildSystemEmailParagraph('Add credits to keep creating content.'),
  ].join('');
}

export interface CreditPurchaseEmailInput {
  amount: number;
  /** Balance after the purchase, when known. */
  balance?: number;
}

/** What was added and what is available now. */
export function buildCreditPurchaseEmailBody(
  input: CreditPurchaseEmailInput,
): string {
  return [
    buildEmailBigNumber({
      caption: 'added to your workspace',
      label: 'Credits added',
      tone: 'success',
      value: `+${formatCount(input.amount)}`,
    }),
    input.balance === undefined
      ? ''
      : buildEmailKeyValueRows([
          {
            label: 'New balance',
            value: `${formatCount(input.balance)} credits`,
          },
        ]),
    buildSystemEmailParagraph('You can continue creating.'),
  ].join('');
}

const LIFECYCLE_PATH: readonly EmailStep[] = [
  {
    detail: 'Voice, look and audience, so content sounds like you.',
    title: 'Set up your brand',
  },
  { detail: 'One destination is enough to start.', title: 'Connect a channel' },
  { detail: 'An image or video from one idea.', title: 'Create content' },
  { detail: 'Review it, then post or schedule.', title: 'Publish it' },
];

const LIFECYCLE_PATH_STEPS = new Set([
  'activation-nudge',
  'first-generation',
  'setup-reminder',
  'welcome-day-0',
  'welcome-day-2',
  'welcome-day-7',
]);

/** The setup path under a lifecycle email's copy; none for billing emails. */
export function buildLifecycleVisualHtml(step: string): string {
  return LIFECYCLE_PATH_STEPS.has(step)
    ? buildEmailEyebrow('Your path to the first post') +
        buildEmailSteps(LIFECYCLE_PATH)
    : '';
}

const FREE_TRIAL_VISUALS: Record<
  string,
  { label: string; value: string; caption: string; tone: EmailTone }
> = {
  'trial-credits-low': {
    caption: 'not enough for another image',
    label: 'Free credits',
    tone: 'warning',
    value: 'Almost gone',
  },
  'trial-ended': {
    caption: 'your brands, drafts and content are still here',
    label: 'Free trial',
    tone: 'danger',
    value: 'Ended',
  },
  'trial-ending': {
    caption: 'unused free credits expire when it ends',
    label: 'Free trial ends in',
    tone: 'warning',
    value: '24 hours',
  },
};

/** One large status figure above the trial copy. */
export function buildFreeTrialVisualHtml(templateKey: string): string {
  const visual = FREE_TRIAL_VISUALS[templateKey];
  return visual ? buildEmailBigNumber(visual) : '';
}

export interface WorkflowStatusEmailInput {
  kind: 'agent-run' | 'workflow';
  isFailed: boolean;
  label: string;
  /** Plain-language summary, failure cause or recovery hint. */
  details: readonly string[];
}

/** A status pill, the thing that ran, then what happened. */
export function buildWorkflowStatusEmailBody(
  input: WorkflowStatusEmailInput,
): string {
  const noun = input.kind === 'workflow' ? 'Workflow' : 'Agent run';
  const pill = buildEmailPill(
    input.isFailed ? 'Failed' : 'Completed',
    input.isFailed ? 'danger' : 'success',
  );
  const header = `<p style="margin:0 0 16px;">${pill}<span style="color:#949494;font-size:12px;padding-left:10px;">${escapeSystemEmailHtml(noun)}</span></p><p style="color:#EDEDED;font-size:18px;font-weight:600;line-height:26px;margin:0 0 16px;">${escapeSystemEmailHtml(input.label)}</p>`;
  const details = input.details
    .filter((detail) => detail.trim().length > 0)
    .map((detail) => buildSystemEmailParagraph(detail))
    .join('');
  return header + details;
}

export interface AgentReviewStatusEmailInput {
  isExpired: boolean;
  label: string;
  summary: string;
}

/** An agent's review request: updated, or lapsed without an answer. */
export function buildAgentReviewStatusEmailBody(
  input: AgentReviewStatusEmailInput,
): string {
  const pill = buildEmailPill(
    input.isExpired ? 'Expired' : 'Needs review',
    input.isExpired ? 'warning' : 'neutral',
  );
  return `<p style="margin:0 0 16px;">${pill}<span style="color:#949494;font-size:12px;padding-left:10px;">Agent review</span></p><p style="color:#EDEDED;font-size:18px;font-weight:600;line-height:26px;margin:0 0 16px;">${escapeSystemEmailHtml(input.label)}</p>${buildSystemEmailParagraph(input.summary)}`;
}

/** The receipt id and the command that uses it, ready to copy. */
export function buildSkillsProReceiptEmailBody(input: {
  receiptId: string;
  command: string;
}): string {
  return [
    buildSystemEmailParagraph(
      'Your Skills Pro purchase is ready. Run this command to install the skills. You do not need a Genfeed account.',
    ),
    buildEmailCodeBlock(input.command),
    buildEmailKeyValueRows([{ label: 'Receipt id', value: input.receiptId }]),
  ].join('');
}
