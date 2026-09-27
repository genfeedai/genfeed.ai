import { describe, expect, it } from 'vitest';
import {
  buildCheckoutToCompletionQuery,
  buildInsightPayload,
  buildSignupToCheckoutQuery,
  buildSubscriptionPayload,
  buildSyntheticBreakEvents,
  deriveIngestionHost,
  FUNNEL_ALERT_DEFINITIONS,
  normalizePostHogHost,
  parseArgs,
} from './setup-funnel-alerts';

const config = {
  alertTargetType: 'slack' as const,
  alertTargetValue: '#alerts',
  environmentId: '123',
  host: 'https://us.posthog.com',
  ingestionHost: 'https://us.i.posthog.com',
  minCheckoutStarts: 1,
  minConversion: 0.01,
  minSignups: 1,
  personalApiKey: 'phx_test',
  projectApiKey: 'phc_test',
  projectId: '123',
  windowMinutes: 60,
};

describe('setup-funnel-alerts', () => {
  it('defaults to a dry run when no action flags are provided', () => {
    expect(parseArgs([])).toEqual({
      apply: false,
      check: false,
      dryRun: true,
      simulateBreak: false,
      testDelivery: false,
    });
  });

  it('normalizes PostHog app and ingestion hosts', () => {
    expect(normalizePostHogHost('https://us.posthog.com/')).toBe(
      'https://us.posthog.com',
    );
    expect(deriveIngestionHost('https://us.posthog.com')).toBe(
      'https://us.i.posthog.com',
    );
  });

  it('builds HogQL insight payloads for both funnel drop-off checks', () => {
    const payloads = FUNNEL_ALERT_DEFINITIONS.map((definition) =>
      buildInsightPayload(definition, config),
    );

    expect(payloads).toHaveLength(2);
    expect(payloads[0].query.kind).toBe('InsightVizNode');
    expect(payloads[0].query.source.kind).toBe('HogQLQuery');
    expect(payloads[0].query.source.query).toContain('signup_completed');
    expect(payloads[0].query.source.query).toContain('checkout_started');
    expect(payloads[0].description).toContain(
      'docs/posthog-funnel-dropoff-runbook.md',
    );
    expect(payloads[1].query.source.query).toContain('checkout_completed');
  });

  it('builds a PostHog subscription payload for the watched channel', () => {
    const payload = buildSubscriptionPayload(
      FUNNEL_ALERT_DEFINITIONS[0],
      42,
      config,
    );

    expect(payload).toEqual(
      expect.objectContaining({
        enabled: true,
        frequency: 'hourly',
        insight: 42,
        target_type: 'slack',
        target_value: '#alerts',
      }),
    );
    expect(payload.prompt).toContain('docs/posthog-funnel-dropoff-runbook.md');
  });

  it('creates synthetic break events without checkout follow-up events', () => {
    const events = buildSyntheticBreakEvents(config, 2);

    expect(events).toHaveLength(2);
    expect(events.every((event) => event.event === 'signup_completed')).toBe(
      true,
    );
    expect(events[0].properties).toMatchObject({
      funnelSimulation: true,
      hasPlanIntent: true,
      issue: 1431,
    });
  });

  it('filters the signup->checkout denominator on paid plan intent (genfeedai/genfeed.ai#4969)', () => {
    const query = buildSignupToCheckoutQuery(config);

    expect(query).toContain(
      "countIf(event = 'signup_completed' AND properties.hasPlanIntent = true) AS signup_completed",
    );
    // The payg free handoff sets hasPlanIntent to false — it must never
    // widen the denominator this filter is meant to narrow.
    expect(query).not.toContain(
      "countIf(event = 'signup_completed') AS signup_completed",
    );
  });

  it('does not filter the checkout->completion query on plan intent', () => {
    // Every checkout, payg or subscription, is a real checkout attempt —
    // only the signup denominator needed the plan-intent filter.
    const query = buildCheckoutToCompletionQuery(config);

    expect(query).not.toContain('hasPlanIntent');
  });
});
