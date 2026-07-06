#!/usr/bin/env bun

type AlertTargetType = 'email' | 'slack';

interface CliArgs {
  apply: boolean;
  check: boolean;
  dryRun: boolean;
  simulateBreak: boolean;
  testDelivery: boolean;
}

interface RuntimeConfig {
  alertTargetType: AlertTargetType;
  alertTargetValue: string;
  environmentId: string;
  host: string;
  ingestionHost: string;
  minCheckoutStarts: number;
  minConversion: number;
  minSignups: number;
  personalApiKey: string;
  projectApiKey: string;
  projectId: string;
  windowMinutes: number;
}

interface FunnelAlertDefinition {
  description: string;
  key: 'checkout_to_completion' | 'signup_to_checkout';
  name: string;
  query: (config: RuntimeConfig) => string;
  runbookAnchor: string;
  subscriptionTitle: string;
}

interface InsightPayload {
  description: string;
  name: string;
  query: {
    kind: 'InsightVizNode';
    source: {
      kind: 'HogQLQuery';
      name: string;
      query: string;
    };
  };
  tags: string[];
}

interface PostHogListResponse<T> {
  results?: T[];
}

interface PostHogInsight {
  id: number;
  name?: string | null;
}

interface PostHogSubscription {
  id: number;
  insight?: number | null;
  target_type?: string | null;
  target_value?: string | null;
  title?: string | null;
}

interface SyntheticCaptureEvent {
  api_key: string;
  distinct_id: string;
  event: string;
  properties: Record<string, boolean | number | string>;
  timestamp: string;
}

const RUNBOOK_URL =
  'https://github.com/genfeedai/genfeed.ai/blob/master/docs/posthog-funnel-dropoff-runbook.md';

export const FUNNEL_ALERT_DEFINITIONS: FunnelAlertDefinition[] = [
  {
    description:
      'Fires when cloud signups reach post-signup but no checkout handoff is created.',
    key: 'signup_to_checkout',
    name: 'Genfeed Funnel Alert: signup to checkout drop-off',
    query: buildSignupToCheckoutQuery,
    runbookAnchor: 'signup-to-checkout-drop-off',
    subscriptionTitle: 'Alert: signup to checkout drop-off',
  },
  {
    description:
      'Fires when checkout handoffs are created but users do not return from Stripe.',
    key: 'checkout_to_completion',
    name: 'Genfeed Funnel Alert: checkout to completion drop-off',
    query: buildCheckoutToCompletionQuery,
    runbookAnchor: 'checkout-to-completion-drop-off',
    subscriptionTitle: 'Alert: checkout to completion drop-off',
  },
];

function readNumberEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
): number {
  const value = env[key]?.trim();
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readTargetType(value: string | undefined): AlertTargetType {
  return value === 'slack' ? 'slack' : 'email';
}

export function normalizePostHogHost(host: string): string {
  const trimmed = host.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return 'https://us.posthog.com';
  }

  return trimmed;
}

export function deriveIngestionHost(host: string): string {
  const normalized = normalizePostHogHost(host);
  if (normalized === 'https://us.posthog.com') {
    return 'https://us.i.posthog.com';
  }
  if (normalized === 'https://eu.posthog.com') {
    return 'https://eu.i.posthog.com';
  }

  return normalized;
}

function loadRuntimeConfig(env: NodeJS.ProcessEnv): RuntimeConfig {
  const host = normalizePostHogHost(env.POSTHOG_HOST ?? '');
  const environmentId =
    env.POSTHOG_ENVIRONMENT_ID?.trim() || env.POSTHOG_PROJECT_ID?.trim() || '';

  return {
    alertTargetType: readTargetType(env.POSTHOG_ALERT_TARGET_TYPE),
    alertTargetValue: env.POSTHOG_ALERT_TARGET_VALUE?.trim() ?? '',
    environmentId,
    host,
    ingestionHost: normalizePostHogHost(
      env.POSTHOG_INGESTION_HOST ?? deriveIngestionHost(host),
    ),
    minCheckoutStarts: readNumberEnv(env, 'POSTHOG_FUNNEL_MIN_CHECKOUTS', 1),
    minConversion: readNumberEnv(env, 'POSTHOG_FUNNEL_MIN_CONVERSION', 0.01),
    minSignups: readNumberEnv(env, 'POSTHOG_FUNNEL_MIN_SIGNUPS', 1),
    personalApiKey: env.POSTHOG_PERSONAL_API_KEY?.trim() ?? '',
    projectApiKey: env.POSTHOG_PROJECT_API_KEY?.trim() ?? '',
    projectId: env.POSTHOG_PROJECT_ID?.trim() || environmentId,
    windowMinutes: readNumberEnv(env, 'POSTHOG_FUNNEL_WINDOW_MINUTES', 60),
  };
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    apply: false,
    check: false,
    dryRun: false,
    simulateBreak: false,
    testDelivery: false,
  };

  for (const arg of argv) {
    if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--check') {
      args.check = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--simulate-break') {
      args.simulateBreak = true;
    } else if (arg === '--test-delivery') {
      args.testDelivery = true;
    }
  }

  if (!args.apply && !args.check && !args.simulateBreak) {
    args.dryRun = true;
  }

  return args;
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function buildRunbookUrl(anchor: string): string {
  return `${RUNBOOK_URL}#${anchor}`;
}

export function buildSignupToCheckoutQuery(config: RuntimeConfig): string {
  return `
WITH counts AS (
  SELECT
    countIf(event = 'signup_completed') AS signup_completed,
    countIf(event = 'checkout_started') AS checkout_started
  FROM events
  WHERE timestamp >= now() - INTERVAL ${config.windowMinutes} MINUTE
    AND event IN ('signup_completed', 'checkout_started')
)
SELECT
  'signup_to_checkout_dropoff' AS alert,
  signup_completed,
  checkout_started,
  checkout_started / signup_completed AS conversion_rate,
  '${escapeSqlString(buildRunbookUrl('signup-to-checkout-drop-off'))}' AS runbook_url
FROM counts
WHERE signup_completed >= ${config.minSignups}
  AND (
    checkout_started = 0
    OR checkout_started / signup_completed < ${config.minConversion}
  )
`.trim();
}

export function buildCheckoutToCompletionQuery(config: RuntimeConfig): string {
  return `
WITH counts AS (
  SELECT
    countIf(event = 'checkout_started') AS checkout_started,
    countIf(event = 'checkout_completed') AS checkout_completed
  FROM events
  WHERE timestamp >= now() - INTERVAL ${config.windowMinutes} MINUTE
    AND event IN ('checkout_started', 'checkout_completed')
)
SELECT
  'checkout_to_completion_dropoff' AS alert,
  checkout_started,
  checkout_completed,
  checkout_completed / checkout_started AS conversion_rate,
  '${escapeSqlString(buildRunbookUrl('checkout-to-completion-drop-off'))}' AS runbook_url
FROM counts
WHERE checkout_started >= ${config.minCheckoutStarts}
  AND (
    checkout_completed = 0
    OR checkout_completed / checkout_started < ${config.minConversion}
  )
`.trim();
}

export function buildInsightPayload(
  definition: FunnelAlertDefinition,
  config: RuntimeConfig,
): InsightPayload {
  return {
    description: `${definition.description} Runbook: ${buildRunbookUrl(
      definition.runbookAnchor,
    )}`,
    name: definition.name,
    query: {
      kind: 'InsightVizNode',
      source: {
        kind: 'HogQLQuery',
        name: definition.key,
        query: definition.query(config),
      },
    },
    tags: ['genfeed', 'funnel', 'alerting', 'issue-1431'],
  };
}

export function buildSubscriptionPayload(
  definition: FunnelAlertDefinition,
  insightId: number,
  config: RuntimeConfig,
) {
  return {
    enabled: true,
    frequency: 'hourly',
    insight: insightId,
    interval: 1,
    prompt: `If this insight returns rows, follow ${buildRunbookUrl(
      definition.runbookAnchor,
    )}.`,
    resource_type: 'insight',
    start_date: new Date().toISOString(),
    target_type: config.alertTargetType,
    target_value: config.alertTargetValue,
    title: definition.subscriptionTitle,
  };
}

export function buildSyntheticBreakEvents(
  config: Pick<RuntimeConfig, 'projectApiKey'>,
  count = 3,
): SyntheticCaptureEvent[] {
  const timestamp = new Date().toISOString();

  return Array.from({ length: count }, (_, index) => ({
    api_key: config.projectApiKey,
    distinct_id: `issue-1431-simulated-break-${Date.now()}-${index}`,
    event: 'signup_completed',
    properties: {
      funnelSimulation: true,
      handoffSource: 'post_signup',
      hasCloudHandoff: true,
      hasCreditsIntent: false,
      hasPlanIntent: true,
      issue: 1431,
    },
    timestamp,
  }));
}

function requireConfig(
  config: RuntimeConfig,
  keys: Array<keyof RuntimeConfig>,
) {
  const missing = keys.filter((key) => !String(config[key] ?? '').trim());
  if (missing.length > 0) {
    throw new Error(`Missing required env: ${missing.join(', ')}`);
  }
}

async function posthogRequest<T>(
  config: RuntimeConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${config.host}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.personalApiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`PostHog request failed ${response.status}: ${body}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function upsertInsight(
  definition: FunnelAlertDefinition,
  config: RuntimeConfig,
): Promise<PostHogInsight> {
  const payload = buildInsightPayload(definition, config);
  const search = encodeURIComponent(definition.name);
  const listed = await posthogRequest<PostHogListResponse<PostHogInsight>>(
    config,
    `/api/environments/${config.environmentId}/insights/?search=${search}`,
  );
  const existing = (listed.results ?? []).find(
    (insight) => insight.name === definition.name,
  );

  if (existing) {
    return await posthogRequest<PostHogInsight>(
      config,
      `/api/environments/${config.environmentId}/insights/${existing.id}/`,
      {
        body: JSON.stringify(payload),
        method: 'PATCH',
      },
    );
  }

  return await posthogRequest<PostHogInsight>(
    config,
    `/api/environments/${config.environmentId}/insights/`,
    {
      body: JSON.stringify(payload),
      method: 'POST',
    },
  );
}

async function upsertSubscription(
  definition: FunnelAlertDefinition,
  insightId: number,
  config: RuntimeConfig,
): Promise<PostHogSubscription> {
  const listed = await posthogRequest<PostHogListResponse<PostHogSubscription>>(
    config,
    `/api/environments/${config.environmentId}/subscriptions/?insight=${insightId}&target_type=${config.alertTargetType}`,
  );
  const existing = (listed.results ?? []).find(
    (subscription) =>
      subscription.title === definition.subscriptionTitle &&
      subscription.target_value === config.alertTargetValue,
  );
  const payload = buildSubscriptionPayload(definition, insightId, config);

  if (existing) {
    return await posthogRequest<PostHogSubscription>(
      config,
      `/api/environments/${config.environmentId}/subscriptions/${existing.id}/`,
      {
        body: JSON.stringify(payload),
        method: 'PATCH',
      },
    );
  }

  return await posthogRequest<PostHogSubscription>(
    config,
    `/api/environments/${config.environmentId}/subscriptions/`,
    {
      body: JSON.stringify(payload),
      method: 'POST',
    },
  );
}

async function runAlertQueries(config: RuntimeConfig): Promise<void> {
  requireConfig(config, ['environmentId', 'personalApiKey', 'projectId']);

  for (const definition of FUNNEL_ALERT_DEFINITIONS) {
    const payload = {
      name: definition.key,
      query: {
        kind: 'HogQLQuery',
        query: definition.query(config),
      },
    };
    const result = await posthogRequest<unknown>(
      config,
      `/api/projects/${config.projectId}/query/`,
      {
        body: JSON.stringify(payload),
        method: 'POST',
      },
    );
    console.log(`${definition.name}:`);
    console.log(JSON.stringify(result, null, 2));
  }
}

async function simulateBreak(config: RuntimeConfig): Promise<void> {
  requireConfig(config, ['projectApiKey']);

  const events = buildSyntheticBreakEvents(config);
  for (const event of events) {
    const response = await fetch(`${config.ingestionHost}/i/v0/e/`, {
      body: JSON.stringify(event),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(
        `Synthetic event capture failed ${response.status}: ${await response.text()}`,
      );
    }
  }

  console.log(`Sent ${events.length} synthetic signup_completed events.`);
}

async function testDeliveries(
  subscriptions: PostHogSubscription[],
  config: RuntimeConfig,
): Promise<void> {
  for (const subscription of subscriptions) {
    await posthogRequest<unknown>(
      config,
      `/api/environments/${config.environmentId}/subscriptions/${subscription.id}/test-delivery/`,
      { method: 'POST' },
    );
    console.log(`Requested test delivery for subscription ${subscription.id}.`);
  }
}

async function applyAlerts(
  config: RuntimeConfig,
): Promise<PostHogSubscription[]> {
  requireConfig(config, [
    'alertTargetValue',
    'environmentId',
    'personalApiKey',
  ]);

  const subscriptions: PostHogSubscription[] = [];

  for (const definition of FUNNEL_ALERT_DEFINITIONS) {
    const insight = await upsertInsight(definition, config);
    const subscription = await upsertSubscription(
      definition,
      insight.id,
      config,
    );
    subscriptions.push(subscription);
    console.log(
      `Configured ${definition.name} as insight ${insight.id}, subscription ${subscription.id}.`,
    );
  }

  return subscriptions;
}

function printDryRun(config: RuntimeConfig): void {
  for (const definition of FUNNEL_ALERT_DEFINITIONS) {
    console.log(
      JSON.stringify(buildInsightPayload(definition, config), null, 2),
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadRuntimeConfig(process.env);

  if (args.dryRun) {
    printDryRun(config);
  }

  let subscriptions: PostHogSubscription[] = [];
  if (args.apply) {
    subscriptions = await applyAlerts(config);
  }

  if (args.simulateBreak) {
    await simulateBreak(config);
  }

  if (args.check) {
    await runAlertQueries(config);
  }

  if (args.testDelivery) {
    if (subscriptions.length === 0) {
      subscriptions = await applyAlerts(config);
    }
    await testDeliveries(subscriptions, config);
  }
}

if (import.meta.main) {
  await main();
}
