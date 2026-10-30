#!/usr/bin/env bun

import { normalizePostHogHost } from './setup-funnel-alerts';

interface AppUsageConfig {
  environmentId: string;
  host: string;
  personalApiKey: string;
  windowDays: number;
}

interface AppUsageInsight {
  description: string;
  name: string;
  query: string;
}

interface PostHogListResponse<T> {
  results?: T[];
}

interface PostHogNamed {
  id: number;
  name?: string | null;
}

export const APP_USAGE_DASHBOARD_NAME = 'App usage';

/** Internal accounts are flagged on the person at identify time. */
const EXTERNAL_ONLY =
  "coalesce(toString(person.properties.is_internal), 'false') != 'true'";

export function buildAppUsageInsights(
  windowDays: number,
): readonly AppUsageInsight[] {
  const window = `timestamp >= now() - INTERVAL ${Math.max(1, Math.floor(windowDays))} DAY`;

  return [
    {
      description:
        'Pageviews, people and sessions per product app. Apps come from the rail path roots.',
      name: 'App usage: pageviews by app',
      query: `SELECT properties.app AS app, count() AS pageviews, count(DISTINCT person_id) AS people, count(DISTINCT properties.$session_id) AS sessions FROM events WHERE event = '$pageview' AND properties.app IS NOT NULL AND ${EXTERNAL_ONLY} AND ${window} GROUP BY app ORDER BY people DESC, pageviews DESC`,
    },
    {
      description: 'Daily people per product app.',
      name: 'App usage: daily people by app',
      query: `SELECT toDate(timestamp) AS day, properties.app AS app, count(DISTINCT person_id) AS people FROM events WHERE event = '$pageview' AND properties.app IS NOT NULL AND ${EXTERNAL_ONLY} AND ${window} GROUP BY day, app ORDER BY day, people DESC`,
    },
    {
      description:
        'Labeled button clicks (Button action prop). The action is a fixed slug, never user text.',
      name: 'App usage: top button actions',
      query: `SELECT properties.action AS action, properties.app AS app, count() AS clicks, count(DISTINCT person_id) AS people FROM events WHERE event = 'ui_action_clicked' AND ${EXTERNAL_ONLY} AND ${window} GROUP BY action, app ORDER BY clicks DESC LIMIT 50`,
    },
  ];
}

function loadConfig(env: NodeJS.ProcessEnv): AppUsageConfig {
  const windowDays = Number(env.POSTHOG_APP_USAGE_WINDOW_DAYS);

  return {
    environmentId:
      env.POSTHOG_ENVIRONMENT_ID?.trim() ||
      env.POSTHOG_PROJECT_ID?.trim() ||
      '',
    host: normalizePostHogHost(env.POSTHOG_HOST ?? ''),
    personalApiKey: env.POSTHOG_PERSONAL_API_KEY?.trim() ?? '',
    windowDays: Number.isFinite(windowDays) && windowDays > 0 ? windowDays : 30,
  };
}

async function posthogRequest<T>(
  config: AppUsageConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${config.host}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.personalApiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `PostHog request failed ${response.status}: ${await response.text()}`,
    );
  }

  return (await response.json()) as T;
}

async function findByName(
  config: AppUsageConfig,
  collection: 'dashboards' | 'insights',
  name: string,
): Promise<PostHogNamed | undefined> {
  const listed = await posthogRequest<PostHogListResponse<PostHogNamed>>(
    config,
    `/api/environments/${config.environmentId}/${collection}/?search=${encodeURIComponent(name)}`,
  );

  return (listed.results ?? []).find((item) => item.name === name);
}

async function upsert(
  config: AppUsageConfig,
  collection: 'dashboards' | 'insights',
  name: string,
  body: Record<string, unknown>,
): Promise<PostHogNamed> {
  const existing = await findByName(config, collection, name);
  const base = `/api/environments/${config.environmentId}/${collection}/`;

  return await posthogRequest<PostHogNamed>(
    config,
    existing ? `${base}${existing.id}/` : base,
    {
      body: JSON.stringify({ name, ...body }),
      method: existing ? 'PATCH' : 'POST',
    },
  );
}

async function apply(config: AppUsageConfig): Promise<void> {
  const dashboard = await upsert(
    config,
    'dashboards',
    APP_USAGE_DASHBOARD_NAME,
    {
      description:
        'Which apps and buttons people use. Internal accounts excluded.',
    },
  );

  for (const insight of buildAppUsageInsights(config.windowDays)) {
    await upsert(config, 'insights', insight.name, {
      dashboards: [dashboard.id],
      description: insight.description,
      query: {
        kind: 'DataTableNode',
        source: { kind: 'HogQLQuery', query: insight.query },
      },
      tags: ['app-usage'],
    });
  }
}

async function main(): Promise<void> {
  const config = loadConfig(process.env);

  if (!process.argv.includes('--apply')) {
    for (const insight of buildAppUsageInsights(config.windowDays)) {
      process.stdout.write(`${insight.name}\n${insight.query}\n\n`);
    }
    process.stdout.write('Dry run. Pass --apply to create the dashboard.\n');
    return;
  }

  if (!(config.environmentId && config.personalApiKey)) {
    throw new Error(
      'POSTHOG_PERSONAL_API_KEY and POSTHOG_ENVIRONMENT_ID (or POSTHOG_PROJECT_ID) are required.',
    );
  }

  await apply(config);
}

if (import.meta.main) {
  await main();
}
