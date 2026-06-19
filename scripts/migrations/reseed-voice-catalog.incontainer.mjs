/**
 * In-container voice catalog reseed (raw pg, no Prisma).
 *
 * Runs INSIDE the prod genfeed-ai-api container, which has node + pg in
 * node_modules and the SSM-hydrated env (DATABASE_URL, ELEVENLABS_API_KEY,
 * HEYGEN_KEY, NODE_EXTRA_CA_CERTS). Mirrors
 * external-voice-catalog.service.ts#syncFromProviders 1:1 so the data matches
 * what POST /voices/import would have written — but without needing a
 * super-admin Clerk token.
 *
 * external_voices columns (from migration 20260614230201):
 *   id TEXT PK (no DB default → generated here), externalId, externalProvider
 *   ("VoiceProvider" enum), name, sampleAudioUrl?, language?, isActive,
 *   isDefaultSelectable, isFeatured, providerData JSONB?, createdAt
 *   (DEFAULT now), updatedAt (no default → set here).
 *   UNIQUE (externalProvider, externalId).
 *
 * Idempotent upsert. Dry-run with --dry. Run:
 *   # Copy this file into the container first (it is referenced as _reseed.mjs):
 *   docker cp scripts/migrations/reseed-voice-catalog.incontainer.mjs genfeed-ai-api:/usr/src/app/_reseed.mjs
 *   docker exec -w /usr/src/app genfeed-ai-api node _reseed.mjs --dry
 *   docker exec -w /usr/src/app genfeed-ai-api node _reseed.mjs
 */

import { randomBytes } from 'node:crypto';
import pg from 'pg';

const { Client } = pg;
const DRY = process.argv.includes('--dry');

function genId() {
  // Unique string PK (Prisma cuid is app-generated; any unique string is valid).
  return `c${Date.now().toString(36)}${randomBytes(10).toString('hex')}`;
}

async function fetchElevenLabs() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    console.error('ELEVENLABS_API_KEY missing — skipping ElevenLabs');
    return [];
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
    console.error('HEYGEN_KEY missing — skipping HeyGen');
    return [];
  }
  const res = await fetch('https://api.heygen.com/v2/voices', {
    headers: { 'X-Api-Key': key, accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HeyGen ${res.status}`);
  const body = await res.json();
  const arr = Array.isArray(body?.data)
    ? body.data
    : (body?.data?.voices ?? []);
  return arr.map((v, index) => ({
    provider: 'HEYGEN',
    externalId: String(v.voice_id ?? v.id ?? `voice_${index}`),
    name: String(v.voice_name ?? v.name ?? `Voice ${index + 1}`),
    preview: String(v.preview_url ?? v.preview ?? '') || null,
    providerData: { index },
  }));
}

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  let voices = [];
  try {
    const [el, hg] = await Promise.all([fetchElevenLabs(), fetchHeyGen()]);
    voices = [...el, ...hg];
    console.log(
      `Fetched ${el.length} ElevenLabs + ${hg.length} HeyGen = ${voices.length}`,
    );
  } catch (err) {
    console.error('Provider fetch failed:', err.message);
    await client.end();
    process.exit(1);
  }

  if (DRY) {
    console.log(
      `[DRY] would upsert ${voices.length} catalog voices. No writes.`,
    );
    await client.end();
    return;
  }

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
