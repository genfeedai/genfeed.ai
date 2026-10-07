import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { groupHits, tenantHit } from './core.mjs';

export const OVERRIDE_PHASE = 'superadminOverrideGets';
const baselinePath = new URL(
  './known-superadmin-override-hits.json',
  import.meta.url,
);
const entryKey = (entry) => `${entry.method} ${entry.route}`;

export function loadBaseline(path = baselinePath) {
  const baseline = JSON.parse(readFileSync(path, 'utf8'));
  if (
    !baseline ||
    typeof baseline.issue !== 'string' ||
    !baseline.issue.trim() ||
    !Array.isArray(baseline.entries)
  )
    throw new Error(
      'Invalid superadmin override baseline: expected issue and entries',
    );
  const keys = new Set();
  for (const entry of baseline.entries) {
    if (
      entry?.method !== 'GET' ||
      typeof entry.route !== 'string' ||
      !entry.route.startsWith('/v1/') ||
      /[?\s]/.test(entry.route) ||
      !Array.isArray(entry.models) ||
      entry.models.some(
        (model) => typeof model !== 'string' || !/^\w+\.\w+$/.test(model),
      )
    )
      throw new Error('Invalid superadmin override baseline entry');
    const key = entryKey(entry);
    if (keys.has(key))
      throw new Error(`Duplicate superadmin override baseline entry: ${key}`);
    keys.add(key);
  }
  return baseline;
}

export function validateBaselineRatchet(candidate, trusted = { entries: [] }) {
  for (const entry of candidate.entries) {
    const previous = trusted.entries.find(
      (allowed) => entryKey(allowed) === entryKey(entry),
    );
    if (
      !previous ||
      entry.models.some((model) => !previous.models.includes(model))
    ) {
      throw new Error(
        `Baseline allowance expansion rejected: ${entryKey(entry)}`,
      );
    }
  }
  return candidate;
}

export function trustedBaseline(
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: uncached CI harness reads its trusted base commit from job-local configuration
  ref = process.env.CLOUD_SWEEP_BASE_SHA ?? 'origin/master',
  read = execFileSync,
) {
  if (!/^[a-zA-Z0-9_./-]+$/.test(ref))
    throw new Error('Invalid trusted baseline ref');
  const path =
    'scripts/ci/cloud-tenant-guard-sweep/known-superadmin-override-hits.json';
  // A new baseline file starts with an empty allowance set; all other read
  // failures must fail closed rather than silently trusting the candidate.
  const exists = read('git', ['ls-tree', '--name-only', ref, '--', path], {
    encoding: 'utf8',
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
  }).trim();
  if (!exists) return { entries: [] };
  return JSON.parse(
    read('git', ['show', `${ref}:${path}`], {
      encoding: 'utf8',
      cwd: fileURLToPath(new URL('../../../', import.meta.url)),
    }),
  );
}

export async function captureOverrideLogOffset(path, wait = delay) {
  // Allow stdout from the completed strict requests to flush before the boundary.
  await wait(1_000);
  return statSync(path).size;
}

export function logEvidence(log, overrideOffset = null) {
  const bytes = Buffer.isBuffer(log) ? log : Buffer.from(log);
  if (
    overrideOffset !== null &&
    (!Number.isSafeInteger(overrideOffset) ||
      overrideOffset < 0 ||
      overrideOffset > bytes.length)
  )
    throw new Error('Invalid superadmin override API log byte offset');
  const hits = [];
  let offset = 0;
  for (const message of bytes.toString('utf8').split('\n')) {
    if (tenantHit(message))
      hits.push({
        message,
        byteOffset: offset,
        phase:
          overrideOffset !== null && offset >= overrideOffset
            ? OVERRIDE_PHASE
            : 'strict',
      });
    offset += Buffer.byteLength(message) + 1;
  }
  return hits;
}

function modelOperation(message) {
  const match = message?.match(/Tenant isolation:\s*(\w+) on (\w+)/);
  return match ? `${match[2]}.${match[1]}` : null;
}

function logRoute(message, requests) {
  const match = message.match(/\b(GET)\s+(\/\S+)/);
  if (!match) return null;
  const path = match[2].split('?')[0];
  const request = requests.find(
    (request) =>
      request.method === match[1] && request.path?.split('?')[0] === path,
  );
  return request
    ? { method: request.method, route: request.route ?? path }
    : null;
}

export function classifyHits(requests, apiLogHits, baseline) {
  const responseHits = requests.filter((request) => request.hasTenantHit);
  const overrideResponses = responseHits.filter(
    (request) =>
      request.sweepPhase === OVERRIDE_PHASE &&
      request.actor === 'S:A' &&
      request.method === 'GET',
  );
  const strictResponses = responseHits.filter(
    (request) => !overrideResponses.includes(request),
  );
  const knownResponses = [];
  const unknownResponses = [];
  const knownLogs = [];
  const unknownLogs = [];
  const observed = new Set();
  const overrideLogs = [];
  for (const request of overrideResponses) {
    const entry = baseline.entries.find(
      (entry) => entryKey(entry) === entryKey(request),
    );
    (entry ? knownResponses : unknownResponses).push(request);
    if (entry) observed.add(entryKey(entry));
  }
  for (const hit of apiLogHits) {
    if (hit.phase !== OVERRIDE_PHASE) {
      unknownLogs.push(hit);
      continue;
    }
    overrideLogs.push(hit);
    const model = modelOperation(hit.message);
    const entries = baseline.entries.filter(
      (entry) => model && entry.models.includes(model),
    );
    (entries.length ? knownLogs : unknownLogs).push(hit);
    for (const entry of entries) observed.add(entryKey(entry));
  }

  // Suggestions contain only S:A evidence. They can never pardon strict hits.
  const suggestions = new Map();
  const add = (entry, model) => {
    const key = entryKey(entry);
    const suggestion = suggestions.get(key) ?? {
      method: entry.method,
      route: entry.route,
      models: [],
    };
    if (model && !suggestion.models.includes(model))
      suggestion.models.push(model);
    suggestions.set(key, suggestion);
  };
  for (const request of overrideResponses)
    add(request, modelOperation(request.message));
  const overrideRequests = requests.filter(
    (request) =>
      request.sweepPhase === OVERRIDE_PHASE &&
      request.actor === 'S:A' &&
      request.method === 'GET',
  );
  for (const hit of overrideLogs) {
    const model = modelOperation(hit.message);
    const matchingResponse = overrideResponses.find(
      (request) => model && modelOperation(request.message) === model,
    );
    // Logs without a URL still need a models allowance. Anchor them to an
    // observed S:A OpenAPI route, never invent a route or allow a strict model.
    const entry =
      logRoute(hit.message, overrideRequests) ??
      matchingResponse ??
      overrideRequests[0];
    if (entry && model) add(entry, model);
  }
  const suggestedBaseline = {
    issue: baseline.issue,
    entries: [...suggestions.values()]
      .sort((a, b) => entryKey(a).localeCompare(entryKey(b)))
      .map((entry) => ({ ...entry, models: entry.models.sort() })),
  };
  return {
    tenantHitGroups: groupHits(
      [...strictResponses, ...unknownResponses],
      unknownLogs,
    ),
    knownHits: groupHits(knownResponses, knownLogs),
    staleBaselineEntries: baseline.entries.filter(
      (entry) => !observed.has(entryKey(entry)),
    ),
    suggestedBaseline,
  };
}

export function hitSummary(report) {
  return [
    ...report.tenantHitGroups.map(
      (group) =>
        `TENANT HIT ${group.model}.${group.operation} ${group.route} (${group.count} hits; ${group.actors.join(', ')})\n  ${group.messages.join('\n  ')}`,
    ),
    ...(report.knownHits.length
      ? [
          `::warning::${report.knownHits.reduce((total, group) => total + group.count, 0)} known S:A tenant hits (${report.knownHits.length} groups; see knownHits in JSON report)`,
        ]
      : []),
    ...report.staleBaselineEntries.map(
      (entry) =>
        `::warning::Stale S:A baseline entry: ${entryKey(entry)} produced no hit this run`,
    ),
    '--- suggestedBaseline ---',
    JSON.stringify(report.suggestedBaseline, null, 2),
    '--- end ---',
  ].join('\n');
}
