import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  announceRelease,
  buildPayloads,
  chunkNotes,
  MAX_CHUNK_LENGTH,
} from './announce-release.mjs';

const WEBHOOK = 'https://discord.com/api/webhooks/1/token';

function recordingFetch(statuses = [204]) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ body: JSON.parse(init.body), url });
    const status = statuses[Math.min(calls.length - 1, statuses.length - 1)];
    return {
      json: async () => ({ retry_after: 0 }),
      ok: status >= 200 && status < 300,
      status,
    };
  };
  return { calls, fetchImpl };
}

test('short notes stay in one chunk with their blank lines kept inside', () => {
  assert.deepEqual(chunkNotes('**New**\n- One\n\n**Fixes**\n- Two\n'), [
    '**New**\n- One\n\n**Fixes**\n- Two',
  ]);
});

test('long notes split on line boundaries and lose no text', () => {
  const lines = Array.from(
    { length: 200 },
    (_, i) => `- item ${i} ${'x'.repeat(40)}`,
  );
  const chunks = chunkNotes(lines.join('\n'));
  assert.equal(chunks.length, 3);
  assert.ok(chunks.every((chunk) => chunk.length <= MAX_CHUNK_LENGTH));
  assert.equal(chunks.join('\n'), lines.join('\n'));
});

test('a single line longer than the limit is cut instead of dropped', () => {
  const chunks = chunkNotes('y'.repeat(MAX_CHUNK_LENGTH + 10));
  assert.deepEqual(
    chunks.map((chunk) => chunk.length),
    [MAX_CHUNK_LENGTH, 10],
  );
});

test('only the first message carries the title and release link, and nothing pings', () => {
  const payloads = buildPayloads({
    notes: `${'a'.repeat(MAX_CHUNK_LENGTH)}\n${'b'.repeat(20)}`,
    releaseUrl: 'https://github.com/genfeedai/genfeed.ai/releases/tag/v0.3.4',
    tag: 'v0.3.4',
  });
  assert.equal(payloads.length, 2);
  assert.deepEqual(payloads[0].embeds[0].title, 'Genfeed v0.3.4');
  assert.equal(
    payloads[0].embeds[0].url,
    'https://github.com/genfeedai/genfeed.ai/releases/tag/v0.3.4',
  );
  assert.equal(payloads[1].embeds[0].title, undefined);
  assert.deepEqual(
    payloads.map((payload) => payload.allowed_mentions),
    [{ parse: [] }, { parse: [] }],
  );
});

test('posts every chunk to the webhook and reports how many', async () => {
  const { calls, fetchImpl } = recordingFetch();
  const sent = await announceRelease({
    fetchImpl,
    notes: `${'a'.repeat(MAX_CHUNK_LENGTH)}\nb`,
    releaseUrl: 'https://example.test/release',
    tag: 'v0.3.4',
    webhookUrl: WEBHOOK,
  });
  assert.equal(sent, 2);
  assert.deepEqual(
    calls.map((call) => call.url),
    [WEBHOOK, WEBHOOK],
  );
});

test('retries once after a rate limit, then succeeds', async () => {
  const { calls, fetchImpl } = recordingFetch([429, 204]);
  const sent = await announceRelease({
    fetchImpl,
    notes: '- one',
    releaseUrl: 'https://example.test/release',
    tag: 'v0.3.4',
    webhookUrl: WEBHOOK,
  });
  assert.equal(sent, 1);
  assert.equal(calls.length, 2);
});

test('a Discord error fails with the status and never the webhook URL', async () => {
  const { fetchImpl } = recordingFetch([500]);
  await assert.rejects(
    announceRelease({
      fetchImpl,
      notes: '- one',
      releaseUrl: 'https://example.test/release',
      tag: 'v0.3.4',
      webhookUrl: WEBHOOK,
    }),
    (error) => {
      assert.equal(error.message, 'Discord answered 500');
      assert.ok(!error.message.includes('token'));
      return true;
    },
  );
});

test('refuses a prerelease tag, an empty note and a non-Discord URL', async () => {
  const base = {
    fetchImpl: recordingFetch().fetchImpl,
    notes: '- one',
    releaseUrl: 'https://example.test/release',
    tag: 'v0.3.4',
    webhookUrl: WEBHOOK,
  };
  await assert.rejects(
    announceRelease({ ...base, tag: 'v0.3.4-rc.1' }),
    /stable vX\.Y\.Z/,
  );
  await assert.rejects(
    announceRelease({ ...base, notes: '\n  \n' }),
    /notes for v0\.3\.4 are empty/,
  );
  await assert.rejects(
    announceRelease({ ...base, webhookUrl: 'https://example.test/hook' }),
    /not a Discord webhook/,
  );
});

const workflow = readFileSync(
  new URL('../../.github/workflows/announce-release.yml', import.meta.url),
  'utf8',
);

test('the workflow follows Release, reads one secret and never fails a finished release', () => {
  assert.match(workflow, /workflow_run:\n {4}workflows:\n {6}- Release\n/);
  assert.match(workflow, /conclusion == 'success'/);
  assert.match(workflow, /run_attempt == 1/);
  assert.match(
    workflow,
    /continue-on-error: \$\{\{ github\.event_name == 'workflow_run' \}\}/,
  );
  assert.match(workflow, /permissions:\n {2}contents: read\n/);
  assert.doesNotMatch(
    workflow,
    /secrets: inherit|id-token:|\$\{\{ secrets\.(?!DISCORD_RELEASE_WEBHOOK_URL)/,
  );
  assert.match(
    workflow,
    /uses: actions\/checkout@[0-9a-f]{40} # v/,
    'every action is pinned to a full commit SHA',
  );
  assert.match(workflow, /persist-credentials: false/);
  // Never print the webhook: the run only echoes the problem it found.
  assert.doesNotMatch(workflow, /echo[^\n]*DISCORD_WEBHOOK_URL"?\s*$/m);
});
