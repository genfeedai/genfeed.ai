#!/usr/bin/env node
// Posts a release's patch notes to a Discord announcement channel.
//
// The notes are written by hand in docs/release-notes/<tag>.md and merged
// before the release is cut, so what customers read is reviewed like any other
// change. The workflow .github/workflows/announce-release.yml calls this file.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const TAG_PATTERN = /^v\d+\.\d+\.\d+$/;
const WEBHOOK_PATTERN =
  /^https:\/\/(?:[a-z]+\.)?discord(?:app)?\.com\/api\/webhooks\//;
// Discord caps an embed description at 4096 characters; stay well under it.
export const MAX_CHUNK_LENGTH = 3800;
// The job times out after 5 minutes; a longer rate-limit wait cannot finish.
const MAX_RETRY_WAIT_MS = 120_000;

export function chunkNotes(notes, maxLength = MAX_CHUNK_LENGTH) {
  const chunks = [];
  let current = '';
  const flush = () => {
    if (current.trim() !== '') {
      chunks.push(current.trim());
    }
    current = '';
  };

  for (const line of notes.replaceAll('\r\n', '\n').split('\n')) {
    let rest = line;
    while (rest.length > maxLength) {
      flush();
      chunks.push(rest.slice(0, maxLength));
      rest = rest.slice(maxLength);
    }
    if (current.length + rest.length + 1 > maxLength) {
      flush();
    }
    current += `${rest}\n`;
  }
  flush();
  return chunks;
}

export function buildPayloads({ tag, releaseUrl, notes }) {
  const chunks = chunkNotes(notes);
  return chunks.map((description, index) => ({
    // No mention is ever resolved from release notes.
    allowed_mentions: { parse: [] },
    embeds: [
      {
        description,
        ...(index === 0 ? { title: `Genfeed ${tag}`, url: releaseUrl } : {}),
      },
    ],
  }));
}

async function post({ fetchImpl, sleep }, webhookUrl, payload) {
  // wait=true makes Discord confirm the message was created before it answers.
  const url = new URL(webhookUrl);
  url.searchParams.set('wait', 'true');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetchImpl(url.toString(), {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    if (response.status === 429 && attempt === 0) {
      const body = await response.json().catch(() => ({}));
      const waitMs = Math.max(Number(body.retry_after) || 1, 0) * 1000;
      if (waitMs > MAX_RETRY_WAIT_MS) {
        // Retrying early would only be rate limited again.
        throw new Error(
          `Discord asked to wait ${Math.ceil(waitMs / 1000)}s; run Announce release again later`,
        );
      }
      await sleep(waitMs);
      continue;
    }
    if (!response.ok) {
      throw new Error(`Discord answered ${response.status}`);
    }
    return;
  }
}

export async function announceRelease({
  fetchImpl = fetch,
  notes,
  releaseUrl,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  tag,
  webhookUrl,
}) {
  if (!TAG_PATTERN.test(tag)) {
    throw new Error(`tag must be a stable vX.Y.Z release, got "${tag}"`);
  }
  if (!WEBHOOK_PATTERN.test(webhookUrl)) {
    throw new Error('webhook URL is not a Discord webhook');
  }
  const payloads = buildPayloads({ notes, releaseUrl, tag });
  if (payloads.length === 0) {
    throw new Error(`release notes for ${tag} are empty`);
  }
  for (const payload of payloads) {
    await post({ fetchImpl, sleep }, webhookUrl, payload);
  }
  return payloads.length;
}

async function main() {
  const { DISCORD_WEBHOOK_URL, NOTES_FILE, RELEASE_URL, TAG } = process.env;
  const notes = readFileSync(NOTES_FILE, 'utf8');
  const count = await announceRelease({
    notes,
    releaseUrl: RELEASE_URL,
    tag: TAG,
    webhookUrl: DISCORD_WEBHOOK_URL,
  });
  process.stdout.write(`announced ${TAG} in ${count} message(s)\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    // The webhook URL is a secret; print only the message, never the request.
    process.stderr.write(`::error::${error.message}\n`);
    process.exit(1);
  });
}
