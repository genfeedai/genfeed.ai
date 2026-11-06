import { describe, expect, it } from 'vitest';

import {
  buildContentRecapEmailBody,
  buildCreditAlertEmailBody,
  buildFreeTrialVisualHtml,
  buildGenerationEmailBody,
  buildLifecycleVisualHtml,
  buildPublishingConnectionEmailBody,
  buildSkillsProReceiptEmailBody,
  buildWorkflowStatusEmailBody,
} from './system-email-templates.helper';

const baseRecap = {
  creditsUsed: 1840,
  generated: 12,
  hasMissingConnection: false,
  items: [],
  period: 'week' as const,
  periodRange: '2026-10-26 to 2026-11-01 (UTC)',
  published: 5,
};

describe('content recap email', () => {
  it('shows created, published, ready and credits as counters', () => {
    const html = buildContentRecapEmailBody(baseRecap);

    expect(html).toContain('>12<');
    expect(html).toContain('>5<');
    expect(html).toContain('>7<');
    expect(html).toContain('>1,840<');
    expect(html).toContain('Ready to publish');
  });

  it('never shows a negative ready count', () => {
    const html = buildContentRecapEmailBody({
      ...baseRecap,
      generated: 2,
      published: 3,
    });

    expect(html).not.toContain('>-1<');
    expect(html).toContain('>0<');
  });

  it('omits performance when nothing was measured', () => {
    expect(buildContentRecapEmailBody(baseRecap)).not.toContain(
      'Performance of published pieces',
    );
  });

  it('shows views and interactions, or Unavailable for a missing one', () => {
    const html = buildContentRecapEmailBody({
      ...baseRecap,
      interactions: null,
      views: 3920,
    });

    expect(html).toContain('>3,920<');
    expect(html).toContain('>Unavailable<');
  });

  it('warns when a brand has no publishing account', () => {
    expect(
      buildContentRecapEmailBody({ ...baseRecap, hasMissingConnection: true }),
    ).toContain('Some content has no publishing account yet');
  });

  it('previews what was created', () => {
    const html = buildContentRecapEmailBody({
      ...baseRecap,
      items: [
        {
          imageUrl: 'https://cdn.genfeed.ai/ingredients/images/abc',
          kind: 'image',
        },
      ],
      moreCount: 4,
    });

    expect(html).toContain('Created this week');
    expect(html).toContain('ingredients/images/abc');
    expect(html).toContain('+ 4 more in your library');
  });
});

describe('other system email bodies', () => {
  it('counts the pieces waiting for a destination', () => {
    const html = buildPublishingConnectionEmailBody({
      brandLabel: 'Trailhead Notebook',
      items: [{ kind: 'image' }],
      waitingCount: 1,
    });

    expect(html).toContain('piece waiting for a destination');
    expect(html).toContain('Trailhead Notebook');
  });

  it('shows the finished piece, or the failure', () => {
    expect(
      buildGenerationEmailBody({
        imageUrl: 'https://cdn.genfeed.ai/ingredients/images/abc',
        isFailed: false,
        kind: 'image',
      }),
    ).toContain('ingredients/images/abc');
    expect(
      buildGenerationEmailBody({ isFailed: true, kind: 'image' }),
    ).toContain('This generation could not finish');
  });

  it('shows the credit balance, never below zero', () => {
    expect(
      buildCreditAlertEmailBody({ isExhausted: true, spendable: -50 }),
    ).toContain('>0<');
    expect(
      buildCreditAlertEmailBody({ isExhausted: false, spendable: 1420 }),
    ).toContain('>1,420<');
  });

  it('adds the setup path to onboarding emails only', () => {
    expect(buildLifecycleVisualHtml('welcome-day-0')).toContain(
      'Connect a channel',
    );
    expect(buildLifecycleVisualHtml('win-back')).toBe('');
    expect(buildLifecycleVisualHtml('checkout-recovery')).toBe('');
  });

  it('adds a status figure to each free-trial notice', () => {
    expect(buildFreeTrialVisualHtml('trial-ending')).toContain('24 hours');
    expect(buildFreeTrialVisualHtml('trial-ended')).toContain('Ended');
    expect(buildFreeTrialVisualHtml('unknown')).toBe('');
  });

  it('escapes the workflow label and error', () => {
    const html = buildWorkflowStatusEmailBody({
      details: ['Failed: <script>x</script>'],
      isFailed: true,
      kind: 'workflow',
      label: '<Daily>',
    });

    expect(html).toContain('&lt;Daily&gt;');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('puts the install command in a code block with the receipt id', () => {
    const html = buildSkillsProReceiptEmailBody({
      command: 'npx @genfeedai/skills-pro install rcpt_1',
      receiptId: 'rcpt_1',
    });

    expect(html).toContain('npx @genfeedai/skills-pro install rcpt_1');
    expect(html).toContain('Receipt id');
  });
});
