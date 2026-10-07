/**
 * In-container voice catalog reseed (raw pg, no Prisma).
 *
 * Runs INSIDE the prod genfeed-ai-api container, which has node + pg in
 * node_modules and the SSM-hydrated env (DATABASE_URL, ELEVENLABS_API_KEY,
 * HEYGEN_KEY, NODE_EXTRA_CA_CERTS). Mirrors
 * external-voice-catalog.service.ts#syncFromProviders 1:1 so the data matches
 * what POST /voices/import would have written — but without needing a
 * super-admin legacy auth provider token.
 *
 * external_voices columns (from migration 20260614230201):
 *   id TEXT PK (no DB default → generated here), externalId, externalProvider
 *   ("VoiceProvider" enum), name, sampleAudioUrl?, language?, isActive,
 *   isDefaultSelectable, isFeatured, providerData JSONB?, createdAt
 *   (DEFAULT now), updatedAt (no default → set here).
 *   UNIQUE (externalProvider, externalId).
 *
 * Idempotent upsert. Dry-run by default; pass --live to write. Run:
 *   # Copy this file into the container first (it is referenced as _reseed.mjs):
 *   docker cp scripts/migrations/reseed-voice-catalog.incontainer.mjs genfeed-ai-api:/usr/src/app/_reseed.mjs
 *   docker exec -w /usr/src/app genfeed-ai-api node _reseed.mjs          # dry-run (default)
 *   docker exec -w /usr/src/app genfeed-ai-api node _reseed.mjs --live   # live writes
 */

import { randomBytes } from 'node:crypto';
import pg from 'pg';

const { Client } = pg;
const DRY = !process.argv.includes('--live');

function genId() {
  // Unique string PK (Prisma cuid is app-generated; any unique string is valid).
  return `c${Date.now().toString(36)}${randomBytes(10).toString('hex')}`;
}

async function fetchElevenLabs() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    // Throw rather than return [] so a missing credential fails the run loudly
    // (caught by main() -> exit 1), instead of silently reporting "0 voices" as
    // success and — in live mode — writing nothing while exiting 0. Matches the
    // .ts variant's fail-closed behavior.
    throw new Error('ELEVENLABS_API_KEY is not set');
  }
  const res = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': key, accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);
  const body = await res.json();
  return (body.voices ?? []).map((v) => ({
    provider: 'ELEVENLABS',
    externalId: v.voice_id,
    name: v.name ?? 'Untitled Voice',
    preview: v.preview_url ?? null,
    providerData: {},
  }));
}

async function fetchHeyGen() {
  const key = process.env.HEYGEN_KEY;
  if (!key) {
    // Fail closed on a missing credential (see fetchElevenLabs).
    throw new Error('HEYGEN_KEY is not set');
  }
  const voices = [];
  const seenTokens = new Set();
  let token;
  for (let page = 0; ; page++) {
    if (page >= 100)
      throw new Error('HeyGen catalog exceeded the pagination limit');
    const url = new URL('https://api.heygen.com/v3/voices');
    url.searchParams.set('type', 'public');
    url.searchParams.set('limit', '100');
    if (token) url.searchParams.set('token', token);
    const res = await fetch(url, {
      headers: { 'X-Api-Key': key, accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HeyGen ${res.status}`);
    const body = await res.json();
    if (!Array.isArray(body.data) || typeof body.has_more !== 'boolean')
      throw new Error('Invalid HeyGen catalog response');
    voices.push(...body.data);
    if (!body.has_more) break;
    if (!body.next_token || seenTokens.has(body.next_token))
      throw new Error('Invalid HeyGen catalog cursor');
    token = body.next_token;
    seenTokens.add(token);
  }
  return voices.map((voice, index) => {
    if (typeof voice.voice_id !== 'string' || !voice.voice_id.trim())
      throw new Error('HeyGen voice has no identity');
    return {
      provider: 'HEYGEN',
      externalId: voice.voice_id,
      name: typeof voice.name === 'string' ? voice.name : voice.voice_id,
      preview:
        typeof voice.preview_audio_url === 'string'
          ? voice.preview_audio_url
          : null,
      providerData: { index },
    };
  });
}

async function main() {
  let voices = [];
  try {
    const [el, hg] = await Promise.all([fetchElevenLabs(), fetchHeyGen()]);
    voices = [...el, ...hg];
    console.log(
      `Fetched ${el.length} ElevenLabs + ${hg.length} HeyGen = ${voices.length}`,
    );
  } catch (err) {
    console.error('Provider fetch failed:', err.message);
    process.exit(1);
  }

  if (DRY) {
    console.log(
      `[DRY] would upsert ${voices.length} catalog voices. No writes.`,
    );
    return;
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  let created = 0;
  let updated = 0;
  let failed = 0;
  for (const v of voices) {
    try {
      const r = await client.query(
        `INSERT INTO external_voices
           (id,"externalId","externalProvider",name,"sampleAudioUrl","providerData","isActive","isDefaultSelectable","isFeatured","createdAt","updatedAt")
         VALUES ($1,$2,$3::"VoiceProvider",$4,$5,$6::jsonb,true,true,false,NOW(),NOW())
         ON CONFLICT ("externalProvider","externalId") DO UPDATE
           SET name=EXCLUDED.name,
               "sampleAudioUrl"=EXCLUDED."sampleAudioUrl",
               "providerData"=EXCLUDED."providerData",
               "updatedAt"=NOW()
         RETURNING (xmax = 0) AS inserted`,
        [
          genId(),
          v.externalId,
          v.provider,
          v.name,
          v.preview,
          JSON.stringify(v.providerData),
        ],
      );
      if (r.rows[0].inserted) created++;
      else updated++;
    } catch (err) {
      failed++;
      console.error(
        `upsert failed ${v.provider} ${v.externalId}: ${err.message}`,
      );
    }
  }

  const summary = await client.query(
    `SELECT "externalProvider" AS provider, count(*)::int AS n
       FROM external_voices GROUP BY "externalProvider" ORDER BY 1`,
  );
  console.log(`\ncreated=${created} updated=${updated} failed=${failed}`);
  console.log('external_voices by provider:');
  for (const row of summary.rows) console.log(`  ${row.provider}: ${row.n}`);

  await client.end();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
