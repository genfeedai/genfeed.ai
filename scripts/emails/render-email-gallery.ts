/**
 * Renders every system email Genfeed sends into one HTML page, using the real
 * template builders with sample data, so a template change can be reviewed
 * before it ships.
 *
 *   bun scripts/emails/render-email-gallery.ts <out.html> [image-dir]
 *
 * `image-dir` holds sample images (any *.webp / *.jpg / *.png). They are
 * inlined as data URIs so the page works offline; the builders themselves only
 * accept hosted http(s) images, exactly as in production.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import {
  buildFreeTrialVisualHtml,
  buildAgentReviewStatusEmailBody,
  buildContentRecapEmailBody,
  buildCreditAlertEmailBody,
  buildCreditPurchaseEmailBody,
  buildGenerationEmailBody,
  buildLifecycleVisualHtml,
  buildPublishingConnectionEmailBody,
  buildSkillsProReceiptEmailBody,
  buildWorkflowStatusEmailBody,
} from '../../packages/helpers/src/email/system-email-templates.helper';
import {
  buildSystemEmailHtml,
  buildSystemEmailParagraph,
} from '../../packages/helpers/src/email/system-email.helper';
import { LIFECYCLE_SYSTEM_EMAILS } from '../../packages/contracts/src/constants/lifecycle-emails.constant';
import { FREE_TRIAL_EMAILS } from '../../packages/contracts/src/constants/free-trial.constant';
import {
  buildTrendDigestHtml,
  buildTrendDigestSubject,
  type TrendDigestItem,
} from '../../packages/helpers/src/trends/trend-digest.helper';
import * as blocks from '../../packages/helpers/src/email/system-email-blocks.helper';
import type { EmailThumbnail } from '../../packages/helpers/src/email/system-email-blocks.helper';

const APP = 'https://app.genfeed.ai';
const SAMPLE_HOST = 'https://samples.invalid';

interface GalleryEmail {
  group: string;
  id: string;
  name: string;
  subject: string;
  trigger: string;
  html: string;
}

const [outPath, imageDir] = process.argv.slice(2);
if (!outPath) {
  throw new Error('usage: render-email-gallery.ts <out.html> [image-dir]');
}

const imageFiles = imageDir
  ? readdirSync(imageDir).filter((file) =>
      ['.webp', '.jpg', '.jpeg', '.png'].includes(extname(file).toLowerCase()),
    )
  : [];
const sampleUrls = imageFiles.map((file) => `${SAMPLE_HOST}/${file}`);
const sampleUrl = (index: number): string | null =>
  sampleUrls.length ? sampleUrls[index % sampleUrls.length] : null;

const tile = (index: number, kind: EmailThumbnail['kind']): EmailThumbnail => ({
  href: `${APP}/acme/~/posts`,
  imageUrl: kind === 'audio' || kind === 'article' ? null : sampleUrl(index),
  kind,
});

const recapItems: EmailThumbnail[] = [
  tile(0, 'video'),
  tile(1, 'image'),
  tile(2, 'video'),
  tile(3, 'image'),
  { ...tile(0, 'article'), label: 'Why trailhead notebooks sell out' },
  tile(0, 'audio'),
];

const emails: GalleryEmail[] = [];

function shell(
  title: string,
  bodyHtml: string,
  extra: {
    action?: { label: string; url: string };
    secondaryAction?: { label: string; url: string };
    footerNote?: string;
    preheader?: string;
    unsubscribeUrl?: string;
  } = {},
): string {
  return buildSystemEmailHtml({ appUrl: APP, bodyHtml, title, ...extra });
}

const prefs = 'Manage these emails in your Genfeed notification preferences.';

emails.push(
  {
    group: 'Content',
    html: shell(
      'Your Genfeed week: 12 pieces created',
      buildContentRecapEmailBody({
        creditsUsed: 1840,
        generated: 12,
        ready: 7,
        hasMissingConnection: false,
        interactions: 214,
        items: recapItems,
        moreCount: 6,
        period: 'week',
        periodRange: '2026-10-26 to 2026-11-01 (UTC)',
        published: 5,
        views: 3920,
      }),
      {
        action: {
          label: 'Review your content',
          url: `${APP}/acme/main/studio`,
        },
        footerNote: prefs,
      },
    ),
    id: 'content-weekly',
    name: 'Weekly recap',
    subject: 'Your Genfeed week: 12 pieces created',
    trigger: 'Mondays, 5+ pieces generated in the past week',
  },
  {
    group: 'Content',
    html: shell(
      'Your Genfeed week: 7 pieces created',
      buildContentRecapEmailBody({
        creditsUsed: 920,
        generated: 7,
        ready: 7,
        hasMissingConnection: true,
        items: recapItems.slice(0, 4),
        period: 'week',
        periodRange: '2026-10-26 to 2026-11-01 (UTC)',
        published: 0,
      }),
      {
        action: {
          label: 'Connect and publish',
          url: `${APP}/acme/main/settings/connected-accounts`,
        },
        footerNote: prefs,
      },
    ),
    id: 'content-weekly-unconnected',
    name: 'Weekly recap, no channel connected',
    subject: 'Your Genfeed week: 7 pieces created',
    trigger: 'Weekly recap when a brand has no publishing account',
  },
  {
    group: 'Content',
    html: shell(
      'Your Genfeed day: 3 pieces created',
      buildContentRecapEmailBody({
        creditsUsed: 310,
        generated: 3,
        ready: 2,
        hasMissingConnection: false,
        items: recapItems.slice(0, 3),
        period: 'day',
        periodRange: '2026-11-01 to 2026-11-01 (UTC)',
        published: 1,
        views: 128,
        interactions: 9,
      }),
      {
        action: {
          label: 'Review your content',
          url: `${APP}/acme/main/studio`,
        },
        footerNote: prefs,
      },
    ),
    id: 'content-daily',
    name: 'Daily recap',
    subject: 'Your Genfeed day: 3 pieces created',
    trigger: 'Days without a weekly recap, 1+ piece generated',
  },
  {
    group: 'Content',
    html: shell(
      'Your Trailhead Notebook content is ready to publish',
      buildPublishingConnectionEmailBody({
        brandLabel: 'Trailhead Notebook',
        items: recapItems.slice(0, 4),
        waitingCount: 9,
      }),
      {
        action: {
          label: 'Connect an account',
          url: `${APP}/acme/trailhead/settings/connected-accounts`,
        },
        footerNote: prefs,
        preheader:
          'You have generated content waiting for a publishing destination.',
      },
    ),
    id: 'publishing-connection',
    name: 'Ready to publish, no channel',
    subject: 'Your Trailhead Notebook content is ready to publish',
    trigger: 'Brand has content from 1-7 days ago and no connected account',
  },
  {
    group: 'Content',
    html: shell(
      'Your content is ready',
      buildGenerationEmailBody({
        brandLabel: 'Trailhead Notebook',
        imageUrl: sampleUrl(2),
        isFailed: false,
        kind: 'video',
      }),
      {
        action: { label: 'View content', url: `${APP}/acme/trailhead/library` },
      },
    ),
    id: 'generation-ready',
    name: 'Generation ready',
    subject: 'Your content is ready',
    trigger: 'A long-running generation finishes',
  },
  {
    group: 'Content',
    html: shell(
      'Your generation needs attention',
      buildGenerationEmailBody({
        isFailed: true,
        kind: 'video',
      }),
      {
        action: {
          label: 'Review generation',
          url: `${APP}/acme/trailhead/library`,
        },
      },
    ),
    id: 'generation-failed',
    name: 'Generation failed',
    subject: 'Your generation needs attention',
    trigger: 'A long-running generation fails',
  },
);

const trends: TrendDigestItem[] = [
  {
    angle:
      'Your audience watches notebook flat-lays; this format is up 4x this week.',
    matchedTerms: ['notebook', 'stationery'],
    platform: 'youtube',
    postIdea: {
      caption:
        'Three notebooks, one desk, zero excuses. Which one are you taking on the trail?',
      format: 'Video · 30s',
      hook: 'The only notebook that survives a rainstorm',
    },
    thumbnailUrl: sampleUrl(0) ?? undefined,
    topic: 'Rainproof notebooks stress test',
    type: 'video',
    url: 'https://www.youtube.com/watch?v=sample',
    usageCount: 2_400_000,
    viralScore: 100,
  },
  {
    angle: 'Hand-lettering is trending with the same buyers.',
    matchedTerms: ['lettering'],
    platform: 'tiktok',
    postIdea: {
      caption: 'Watch the whole page come together.',
      format: 'Video · 20s',
      hook: 'Hand-lettering a trail map in 20 seconds',
    },
    thumbnailUrl: sampleUrl(1) ?? undefined,
    topic: 'Trail map hand-lettering',
    type: 'video',
    url: 'https://www.tiktok.com/@sample/video/1',
    usageCount: 860_000,
    viralScore: 96,
  },
  {
    matchedTerms: ['journaling'],
    platform: 'twitter',
    posts: [
      {
        authorHandle: '@fieldnotes',
        likes: 3200,
        platform: 'twitter',
        text: 'Journaling outside beats journaling at a desk. Fight me.',
        url: 'https://x.com/fieldnotes/status/1',
        views: 190_000,
      },
    ],
    topic: 'Outdoor journaling',
    type: 'topic',
    url: 'https://x.com/search?q=outdoor%20journaling',
    usageCount: 190_000,
    viralScore: 88,
  },
];

emails.push({
  group: 'Trends and performance',
  html: buildTrendDigestHtml(trends, {
    appUrl: APP,
    brandLabel: 'Trailhead Notebook',
    minViralScore: 70,
  }),
  id: 'trend-digest',
  name: 'Daily trends digest',
  subject: buildTrendDigestSubject(trends),
  trigger: 'Daily, brand-scoped, when niche-matched trends exist',
});

emails.push({
  group: 'Trends and performance',
  html: shell(
    'Weekly Performance Digest',
    `${buildPerformanceStats()}${buildSystemEmailParagraph('Top performers, platform breakdown and best posting times follow in the live email.')}`,
    {
      action: {
        label: 'Review and publish content',
        url: `${APP}/acme/main/analytics`,
      },
      footerNote:
        'This is an automated performance digest. To unsubscribe, update your notification preferences in Genfeed.',
    },
  ),
  id: 'performance-digest',
  name: 'Weekly performance digest (header only)',
  subject: 'Weekly Performance Digest - Acme',
  trigger: 'Weekly, when analytics exist',
});

function buildPerformanceStats(): string {
  // Same call the live digest makes for its first block.
  const { buildEmailEyebrow, buildEmailStatRow } = blocks;
  return (
    buildEmailEyebrow('Week-over-week engagement') +
    buildEmailStatRow([
      { label: 'Engagements this week', value: '1,420' },
      { label: 'Engagements last week', value: '1,105' },
      { hint: 'Up', label: 'Change', tone: 'success', value: '+28.5%' },
    ])
  );
}

emails.push(
  {
    group: 'Credits and billing',
    html: shell(
      'Your Genfeed credits are running low',
      buildCreditAlertEmailBody({ isExhausted: false, spendable: 420 }),
      {
        action: { label: 'Add credits', url: `${APP}/acme/~/settings/credits` },
        footerNote: prefs,
      },
    ),
    id: 'credit-low',
    name: 'Credits running low',
    subject: 'Your Genfeed credits are running low',
    trigger: 'Balance under 10% of the latest paid grant',
  },
  {
    group: 'Credits and billing',
    html: shell(
      'Your Genfeed credits are used up',
      buildCreditAlertEmailBody({ isExhausted: true, spendable: 0 }),
      {
        action: { label: 'Add credits', url: `${APP}/acme/~/settings/credits` },
        footerNote: prefs,
      },
    ),
    id: 'credit-exhausted',
    name: 'Credits used up',
    subject: 'Your Genfeed credits are used up',
    trigger: 'Spendable balance reaches zero',
  },
  {
    group: 'Credits and billing',
    html: shell(
      'Your credits are available',
      buildCreditPurchaseEmailBody({ amount: 5000 }),
      { action: { label: 'Open your workspace', url: APP } },
    ),
    id: 'credit-purchase',
    name: 'Credit purchase confirmation',
    subject: 'Your Genfeed credits are available',
    trigger: 'A Stripe credit purchase lands',
  },
);

for (const key of [
  'trial-ending',
  'trial-credits-low',
  'trial-ended',
] as const) {
  const definition = FREE_TRIAL_EMAILS[key];
  emails.push({
    group: 'Credits and billing',
    html: shell(
      definition.subject,
      buildFreeTrialVisualHtml(key) +
        definition.paragraphs.map((p) => buildSystemEmailParagraph(p)).join(''),
      {
        action: {
          label: definition.actionLabel,
          url: `${APP}/acme/~/settings/${definition.action === 'plans' ? 'subscription' : 'credits'}`,
        },
        footerNote: prefs,
        secondaryAction: {
          label:
            definition.action === 'plans' ? 'Buy credits' : 'Compare plans',
          url: `${APP}/acme/~/settings/credits`,
        },
      },
    ),
    id: key,
    name: `Free trial: ${key.replace('trial-', '').replace('-', ' ')}`,
    subject: definition.subject,
    trigger: 'Free-trial sweep, once per organization',
  });
}

for (const definition of LIFECYCLE_SYSTEM_EMAILS) {
  emails.push({
    group: 'Lifecycle',
    html: shell(
      definition.title,
      definition.paragraphs
        .map((p) =>
          buildSystemEmailParagraph(p.replace('{{greeting}}', 'Hi Vincent')),
        )
        .join('') + buildLifecycleVisualHtml(definition.step),
      {
        action: { label: definition.action.label, url: APP },
        footerNote:
          'You are receiving this account lifecycle email because you signed up for Genfeed.ai.',
        preheader: definition.preheader,
        unsubscribeUrl:
          'https://api.genfeed.ai/lifecycle-emails/unsubscribe?token=t',
      },
    ),
    id: definition.id,
    name: definition.name,
    subject: definition.subject,
    trigger: `${definition.trigger} (${definition.schedule})`,
  });
}

emails.push(
  {
    group: 'Workflows and agents',
    html: shell(
      'Workflow completed: Daily Trends Digest',
      buildWorkflowStatusEmailBody({
        details: ['Completed successfully.'],
        isFailed: false,
        kind: 'workflow',
        label: 'Daily Trends Digest',
      }),
    ),
    id: 'workflow-completed',
    name: 'Workflow completed',
    subject: 'Workflow completed: Daily Trends Digest',
    trigger: 'A workflow run finishes',
  },
  {
    group: 'Workflows and agents',
    html: shell(
      'Workflow failed: Daily Trends Digest',
      buildWorkflowStatusEmailBody({
        details: ['Failed: the X source returned an authorization error.'],
        isFailed: true,
        kind: 'workflow',
        label: 'Daily Trends Digest',
      }),
    ),
    id: 'workflow-failed',
    name: 'Workflow failed',
    subject: 'Workflow failed: Daily Trends Digest',
    trigger: 'A workflow run fails',
  },
  {
    group: 'Workflows and agents',
    html: shell(
      'Agent run completed: Weekly content agent',
      buildWorkflowStatusEmailBody({
        details: [
          'Drafted 3 posts for Trailhead Notebook and queued them for review.',
        ],
        isFailed: false,
        kind: 'agent-run',
        label: 'Weekly content agent',
      }),
      {
        action: {
          label: 'View agent',
          url: `${APP}/acme/main/automation/agents/x`,
        },
      },
    ),
    id: 'agent-completed',
    name: 'Agent run completed',
    subject: 'Agent run completed: Weekly content agent',
    trigger: 'An agent run finishes',
  },
  {
    group: 'Workflows and agents',
    html: shell(
      'Agent run failed: Weekly content agent',
      buildWorkflowStatusEmailBody({
        details: [
          'The run stopped before drafting',
          'The Instagram connection has expired.',
          'Reconnect the account, then run the agent again.',
        ],
        isFailed: true,
        kind: 'agent-run',
        label: 'Weekly content agent',
      }),
      {
        action: {
          label: 'View agent',
          url: `${APP}/acme/main/automation/agents/x`,
        },
      },
    ),
    id: 'agent-failed',
    name: 'Agent run failed',
    subject: 'Agent run failed: Weekly content agent',
    trigger: 'An agent run fails',
  },
  {
    group: 'Workflows and agents',
    html: shell(
      'Agent review updated: Weekly content agent',
      buildAgentReviewStatusEmailBody({
        isExpired: false,
        label: 'Weekly content agent',
        summary: '3 drafts are waiting for your approval.',
      }),
      {
        action: {
          label: 'View agent',
          url: `${APP}/acme/main/automation/agents/x`,
        },
      },
    ),
    id: 'agent-review',
    name: 'Agent review',
    subject: 'Agent review updated: Weekly content agent',
    trigger: 'An agent asks for approval, or the request expires',
  },
);

emails.push(
  {
    group: 'Account',
    html: buildSystemEmailHtml({
      action: { label: 'Sign in', url: `${APP}/auth/magic?token=sample` },
      bodyHtml: buildSystemEmailParagraph(
        'Click the button below to sign in. This link expires shortly and can only be used once.',
      ),
      footerNote:
        'If you did not request this sign-in link, you can safely ignore this email.',
      title: 'Sign in to Genfeed.ai',
    }),
    id: 'magic-link',
    name: 'Sign-in link',
    subject: 'Sign in to Genfeed.ai',
    trigger: 'Magic-link sign-in or sign-up (no graphics: security email)',
  },
  {
    group: 'Account',
    html: buildSystemEmailHtml({
      action: { label: 'Accept invitation', url: `${APP}/invite/sample` },
      bodyHtml: buildSystemEmailParagraph(
        'An invitation was sent to you@example.com. Accept it to join Acme. This link expires in 7 days and can only be used once.',
      ),
      footerNote:
        'If you did not expect this invitation, you can safely ignore this email.',
      title: 'Join Acme on Genfeed.ai',
    }),
    id: 'invitation',
    name: 'Team invitation',
    subject: 'Join Acme on Genfeed.ai',
    trigger: 'A member is invited to an organization',
  },
  {
    group: 'Account',
    html: buildSystemEmailHtml({
      bodyHtml: buildSkillsProReceiptEmailBody({
        command: 'npx @genfeedai/skills-pro install rcpt_9f2c71',
        receiptId: 'rcpt_9f2c71',
      }),
      preheader: 'Your Skills Pro install command is inside.',
      title: 'Your Skills Pro receipt',
    }),
    id: 'skills-pro-receipt',
    name: 'Skills Pro receipt',
    subject: 'Your Skills Pro receipt',
    trigger: 'A Skills Pro checkout completes',
  },
);

function inlineSamples(html: string): string {
  let result = html;
  imageFiles.forEach((file, index) => {
    const mime =
      extname(file).toLowerCase() === '.webp'
        ? 'image/webp'
        : extname(file).toLowerCase() === '.png'
          ? 'image/png'
          : 'image/jpeg';
    const data = readFileSync(join(imageDir, file)).toString('base64');
    // Whole attribute values, so one sample URL never rewrites another that
    // merely starts with it.
    result = result.replaceAll(
      `src="${sampleUrls[index]}"`,
      `src="data:${mime};base64,${data}"`,
    );
  });
  return result;
}

const groups = [...new Set(emails.map((email) => email.group))];
const attr = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');

const nav = groups
  .map(
    (group) =>
      `<div class="group">${group}</div>${emails
        .filter((email) => email.group === group)
        .map((email) => `<a href="#${email.id}">${attr(email.name)}</a>`)
        .join('')}`,
  )
  .join('');

const body = emails
  .map(
    (email) => `<section id="${email.id}">
  <header><h2>${attr(email.name)}</h2><p>Subject: <b>${attr(email.subject)}</b><br>Sent: ${attr(email.trigger)}</p></header>
  <iframe loading="lazy" title="${attr(email.name)}" srcdoc="${attr(inlineSamples(email.html))}" onload="this.style.height=(this.contentDocument.documentElement.scrollHeight+8)+'px'"></iframe>
</section>`,
  )
  .join('\n');

writeFileSync(
  outPath,
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Genfeed emails</title>
<style>
:root{color-scheme:dark}
body{background:#111;color:#EDEDED;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;margin:0;display:flex}
nav{background:#0A0A0A;border-right:1px solid #333;box-sizing:border-box;flex:0 0 260px;height:100vh;overflow:auto;padding:16px;position:sticky;top:0}
nav h1{font-size:16px;margin:0 0 4px}
nav p{color:#949494;font-size:12px;margin:0 0 12px}
nav .group{color:#949494;font-size:11px;letter-spacing:.08em;margin:16px 0 4px;text-transform:uppercase}
nav a{color:#EDEDED;display:block;padding:4px 0;text-decoration:none}
nav a:hover{text-decoration:underline}
main{flex:1;min-width:0;padding:24px}
section{margin:0 auto 56px;max-width:640px}
section header{margin-bottom:12px}
section h2{font-size:18px;margin:0}
section header p{color:#949494;font-size:12px;margin:4px 0 0}
iframe{background:#000;border:1px solid #333;border-radius:8px;min-height:300px;width:100%}
@media(max-width:800px){nav{display:none}}
</style></head><body>
<nav><h1>Genfeed emails</h1><p>${emails.length} templates, rendered by the real builders with sample data.</p>${nav}</nav>
<main>${body}</main></body></html>`,
);
// eslint-disable-next-line no-console
process.stdout.write(`${emails.length} emails -> ${outPath}\n`);
