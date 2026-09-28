import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export function stableValue(value) {
  if (Array.isArray(value)) {
    const values = value.map(stableValue);
    if (
      values.every((entry) =>
        ['string', 'number', 'boolean'].includes(typeof entry),
      )
    ) {
      return values.sort((left, right) =>
        String(left).localeCompare(String(right)),
      );
    }
    return values;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

export function isDirectHardCut(record) {
  return (
    [404, 410].includes(record.http_status) &&
    record.redirect_hops?.length === 1 &&
    record.redirect_hops[0].status === record.http_status
  );
}

export function isPriorOnlyHardCut(record) {
  return (
    record.discovery_sources?.length > 0 &&
    record.discovery_sources.every(
      (source) => source === 'prior_successful_snapshot',
    ) &&
    isDirectHardCut(record)
  );
}

export function buildDiff({ issues, priorSnapshot, recordByUrl, completedAt }) {
  const priorIssues = priorSnapshot?.issues ?? [];
  const priorMap = new Map(
    priorIssues.map((issue) => [issue.fingerprint, issue]),
  );
  const currentMap = new Map(issues.map((issue) => [issue.fingerprint, issue]));
  const added = issues.filter((issue) => !priorMap.has(issue.fingerprint));
  const resolved = priorIssues
    .filter((issue) => !currentMap.has(issue.fingerprint))
    .map((issue) => {
      const record = recordByUrl.get(issue.normalized_url);
      if (record && isPriorOnlyHardCut(record)) {
        return {
          ...issue,
          resolved_at: completedAt,
          resolution_reason: 'hard_cut_removed',
        };
      }
      return { ...issue, resolved_at: completedAt };
    });
  const persistent = issues.filter((issue) => issue.age_days >= 14);
  const changed = issues
    .filter((issue) => {
      const prior = priorMap.get(issue.fingerprint);
      return (
        prior &&
        stableStringify(prior.observed) !== stableStringify(issue.observed)
      );
    })
    .map((issue) => ({
      ...issue,
      prior_observed: priorMap.get(issue.fingerprint).observed,
    }));
  return { new: added, resolved, persistent, changed };
}

export function crawlCompleted(snapshot) {
  return (
    snapshot.status !== 'partial' &&
    !snapshot.check_failures.some(
      (failure) => failure.check !== 'pagespeed_field_data',
    )
  );
}

export async function persistSnapshot(reportDir, snapshot) {
  await mkdir(reportDir, { recursive: true });
  snapshot.status = crawlCompleted(snapshot) ? 'success' : 'partial';
  const outputPath = join(
    reportDir,
    `${snapshot.snapshot_id}${snapshot.status === 'partial' ? '.partial' : ''}.json`,
  );
  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  await writeFile(outputPath, serialized, 'utf8');
  if (snapshot.status === 'success') {
    const temporaryPath = join(
      reportDir,
      `.latest-${snapshot.snapshot_id}-${process.pid}.tmp`,
    );
    await writeFile(temporaryPath, serialized, 'utf8');
    await rename(temporaryPath, join(reportDir, 'latest.json'));
  }
  return outputPath;
}

export function dispositionSummary(
  issues,
  inventory,
  path,
  error = null,
  records = [],
) {
  const valid =
    inventory &&
    typeof inventory.baseline_snapshot_id === 'string' &&
    typeof inventory.issue_url === 'string' &&
    Array.isArray(inventory.dispositions) &&
    inventory.dispositions.every(
      (entry) =>
        entry &&
        ['accepted', 'source_correction', 'deployment_pending'].includes(
          entry.status,
        ) &&
        [
          'fingerprint',
          'url',
          'rule',
          'severity',
          'owner',
          'reason',
          'source',
        ].every(
          (key) => typeof entry[key] === 'string' && entry[key].length > 0,
        ),
    );
  const needsReview = [];
  const recordByUrl = new Map(
    records.map((record) => [record.normalized_url, record]),
  );
  const matches = valid
    ? issues.flatMap((issue) => {
        const entry = inventory.dispositions.find(
          (candidate) =>
            candidate.fingerprint === issue.fingerprint &&
            candidate.url === issue.normalized_url &&
            candidate.rule === issue.rule,
        );
        if (!entry) return [];
        const observationMatches =
          Object.hasOwn(entry, 'observed') &&
          stableStringify(entry.observed) === stableStringify(issue.observed) &&
          entry.severity === issue.severity;
        const boundaryMatches =
          !entry.requires_nonindexable ||
          recordByUrl.get(issue.normalized_url)?.robots?.indexable === false;
        if (
          !observationMatches ||
          (entry.status === 'accepted' && !boundaryMatches)
        ) {
          needsReview.push({
            ...entry,
            current_observed: issue.observed,
            review_reason: !observationMatches
              ? 'Observation or severity changed from inventory.'
              : 'Required non-indexable boundary was not confirmed.',
          });
          return [];
        }
        return [{ ...entry, verification: 'observed_in_current_crawl' }];
      })
    : [];
  return {
    inventory_path: path,
    inventory_status: valid ? 'available' : 'unavailable',
    inventory_error: valid
      ? null
      : (error ?? 'Missing or invalid disposition inventory.'),
    baseline_snapshot_id: valid ? inventory.baseline_snapshot_id : null,
    issue_url: valid ? inventory.issue_url : null,
    matched: matches,
    needs_review: needsReview,
    unmatched_issue_count: issues.length - matches.length,
    accepted_count: matches.filter((entry) => entry.status === 'accepted')
      .length,
    source_correction_count: matches.filter(
      (entry) => entry.status === 'source_correction',
    ).length,
    deployment_pending_count: matches.filter(
      (entry) => entry.status === 'deployment_pending',
    ).length,
    note: 'Annotations only. Raw issues and diffs are unchanged; source corrections are not verified by inventory entries.',
  };
}
