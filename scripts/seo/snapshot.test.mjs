import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  buildDiff,
  dispositionSummary,
  isDirectHardCut,
  isPriorOnlyHardCut,
  persistSnapshot,
} from './snapshot.mjs';

for (const check of [
  'page_fetch',
  'rendered_dom',
  'robots_fetch',
  'sitemap_fetch',
  'headless_brave_launch',
  'load_dependencies',
  'crawl_limit',
]) {
  test(`${check} preserves successful baseline and saves exact partial failure`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'seo-snapshot-'));
    try {
      const baseline = '{"status":"success","snapshot_id":"baseline"}\n';
      await writeFile(join(directory, 'latest.json'), baseline);
      const failure = {
        check,
        url: 'https://example.com/',
        reason: 'fixture failure',
      };
      const path = await persistSnapshot(directory, {
        snapshot_id: 'next',
        status: 'success',
        check_failures: [failure],
      });
      assert.equal(
        await readFile(join(directory, 'latest.json'), 'utf8'),
        baseline,
      );
      assert.equal(path, join(directory, 'next.partial.json'));
      assert.deepEqual(
        JSON.parse(await readFile(path, 'utf8')).check_failures,
        [failure],
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test('PageSpeed measurement failure permits atomic successful snapshot promotion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'seo-snapshot-'));
  try {
    const path = await persistSnapshot(join(directory, 'nested'), {
      snapshot_id: 'next',
      status: 'success',
      check_failures: [{ check: 'pagespeed_field_data', reason: 'HTTP 429' }],
    });
    assert.equal(
      await readFile(path, 'utf8'),
      await readFile(join(directory, 'nested/latest.json'), 'utf8'),
    );
    assert.equal(JSON.parse(await readFile(path, 'utf8')).status, 'success');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('prior-only hard cuts leave active URLs and resolve with explicit reason', () => {
  const record = {
    normalized_url: 'https://example.com/old',
    discovery_sources: ['prior_successful_snapshot'],
    http_status: 410,
    redirect_hops: [{ status: 410 }],
  };
  const issue = { fingerprint: 'old', normalized_url: record.normalized_url };
  assert.deepEqual(
    [record].filter((entry) => !isPriorOnlyHardCut(entry)),
    [],
  );
  assert.equal(
    isPriorOnlyHardCut({ ...record, discovery_sources: ['sitemap'] }),
    false,
  );
  const diff = buildDiff({
    issues: [],
    priorSnapshot: { issues: [issue] },
    recordByUrl: new Map([[record.normalized_url, record]]),
    completedAt: 'now',
  });
  assert.equal(diff.resolved[0].resolution_reason, 'hard_cut_removed');
});

test('object key order does not fabricate a changed observation', () => {
  const prior = { fingerprint: 'same', observed: { a: 1, b: 2 } };
  const diff = buildDiff({
    issues: [{ ...prior, observed: { b: 2, a: 1 } }],
    priorSnapshot: { issues: [prior] },
    recordByUrl: new Map(),
    completedAt: 'now',
  });
  assert.deepEqual(diff.changed, []);
});

test('disposition requires fingerprint, URL and rule and cannot suppress raw evidence', () => {
  const issue = {
    fingerprint: 'one',
    normalized_url: 'https://example.com/',
    rule: 'title',
    severity: 'error',
    observed: { exact: 'Title' },
  };
  const inventory = {
    baseline_snapshot_id: 'baseline',
    issue_url: 'https://github.com/example/issues/1',
    dispositions: [
      {
        fingerprint: 'one',
        url: issue.normalized_url,
        rule: 'title',
        severity: 'error',
        observed: { exact: 'Title' },
        status: 'source_correction',
        owner: 'owner',
        reason: 'fixed in source',
        source: 'file',
      },
    ],
  };
  const original = structuredClone(issue);
  assert.equal(
    dispositionSummary([issue], inventory, 'inventory').source_correction_count,
    1,
  );
  assert.equal(
    dispositionSummary([{ ...issue, rule: 'other' }], inventory, 'inventory')
      .matched.length,
    0,
  );
  assert.equal(
    dispositionSummary([issue], null, 'missing').inventory_status,
    'unavailable',
  );
  assert.equal(dispositionSummary([issue], null, 'missing').accepted_count, 0);
  assert.deepEqual(issue, original);
});

test('accepted dispositions expire on changed observation or lost noindex boundary', () => {
  const issue = {
    fingerprint: 'one',
    normalized_url: 'https://app.genfeed.ai/',
    rule: 'thin_content',
    severity: 'warning',
    observed: { words: 10 },
  };
  const inventory = {
    baseline_snapshot_id: 'baseline',
    issue_url: 'issue',
    dispositions: [
      {
        ...issue,
        url: issue.normalized_url,
        status: 'accepted',
        requires_nonindexable: true,
        owner: 'owner',
        reason: 'private',
        source: 'file',
      },
    ],
  };
  const records = [
    { normalized_url: issue.normalized_url, robots: { indexable: false } },
  ];
  assert.equal(
    dispositionSummary([issue], inventory, 'inventory', null, records)
      .accepted_count,
    1,
  );
  const changed = dispositionSummary(
    [{ ...issue, observed: { words: 11 } }],
    inventory,
    'inventory',
    null,
    records,
  );
  assert.equal(changed.accepted_count, 0);
  assert.equal(changed.needs_review.length, 1);
  assert.equal(
    dispositionSummary([issue], inventory, 'inventory').accepted_count,
    0,
  );
  assert.equal(
    dispositionSummary([issue], inventory, 'inventory', null, [
      { ...records[0], robots: { indexable: true } },
    ]).needs_review.length,
    1,
  );
});

test('redirected prior-only 404 remains active and violates the direct hard-cut contract', () => {
  const record = {
    normalized_url: 'https://marketplace.genfeed.ai/blog/old',
    discovery_sources: ['prior_successful_snapshot'],
    http_status: 404,
    redirect_hops: [{ status: 301 }, { status: 404 }],
  };
  assert.equal(isDirectHardCut(record), false);
  assert.equal(isPriorOnlyHardCut(record), false);
  assert.deepEqual(
    [record].filter((entry) => !isPriorOnlyHardCut(entry)),
    [record],
  );
  assert.equal(
    isPriorOnlyHardCut({
      ...record,
      discovery_sources: [],
      redirect_hops: [{ status: 404 }],
    }),
    false,
  );
  assert.equal(isDirectHardCut({ ...record, redirect_hops: [] }), false);
  assert.equal(
    isDirectHardCut({ ...record, redirect_hops: [{ status: 404 }] }),
    true,
  );
});
