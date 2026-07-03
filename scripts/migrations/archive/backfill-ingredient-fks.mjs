/**
 * Backfill ingredient FK columns (metadataId, brandId, organizationId, userId)
 * for assets migrated by mongo-to-postgres.ts.
 *
 * WHY: the migration resolves these FKs inline during phase-3 insert using an
 * in-memory idMap only populated for entities inserted in the SAME run. Because
 * metadata + tenants were imported in separate invocations, the inline
 * resolution found an empty map and wrote NULL FKs. This fixes the already-
 * inserted rows by reading each asset's refs from Mongo and resolving them to
 * PG ids — by mongoId, with a natural-key fallback (brand slug, user email) so
 * tenants that were REUSED in PG (different mongoId, same slug/email) resolve too.
 *
 * Batched (one Mongo fetch per collection) so it doesn't time out.
 * Read-only Mongo. PG: dry-run by default; --live to UPDATE (COALESCE — only
 * fills nulls, never overwrites).
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MongoClient, ObjectId } from 'mongodb';

const bun = join(process.cwd(), 'node_modules/.bun');
const pg = (
  await import(
    join(
      bun,
      readdirSync(bun).find((d) => d.startsWith('pg@')),
      'node_modules/pg/lib/index.js',
    )
  )
).default;
const LIVE = process.argv.includes('--live');

const u = new URL(process.env.DATABASE_URL);
u.searchParams.set('sslmode', 'no-verify');
const c = new pg.Client({
  connectionString: u.toString(),
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const m = new MongoClient(
  process.env.__MURI ?? process.env.LEGACY_MONGODB_URI,
  { serverSelectionTimeoutMS: 15000 },
);
await m.connect();
const cloud = m.db('cloud'),
  auth = m.db('auth');
const q = async (s, p) => (await c.query(s, p)).rows;
const hex = (r) =>
  r == null ? null : typeof r === 'object' ? r.toString() : String(r);
const toOid = (s) => {
  try {
    return new ObjectId(s);
  } catch {
    return s;
  }
};

console.log(`Mode: ${LIVE ? 'LIVE' : 'DRY RUN'}`);

// --- PG hydration: mongoId -> id, plus natural-key -> id ---
const map = async (sql) => {
  const mm = new Map();
  for (const r of await q(sql)) mm.set(r.k, r.id);
  return mm;
};
const metaByMongo = await map(
  `select id, "mongoId" k from metadata where "mongoId" is not null`,
);
const brandByMongo = await map(
  `select id, "mongoId" k from brands where "mongoId" is not null`,
);
const brandBySlug = await map(
  `select id, lower(slug) k from brands where slug is not null`,
);
const orgByMongo = await map(
  `select id, "mongoId" k from organizations where "mongoId" is not null`,
);
const userByMongo = await map(
  `select id, "mongoId" k from users where "mongoId" is not null`,
);
const userByEmail = await map(
  `select id, lower(email) k from users where email is not null`,
);
console.log(
  `PG maps: meta=${metaByMongo.size} brandMongo=${brandByMongo.size} brandSlug=${brandBySlug.size} orgMongo=${orgByMongo.size} userMongo=${userByMongo.size} userEmail=${userByEmail.size}`,
);

// --- candidates: PG assets with mongoId + some FK null ---
const candidates = await q(`select id, "mongoId" from ingredients
  where "mongoId" is not null and "isDeleted"=false
  and ("metadataId" is null or "brandId" is null or "organizationId" is null or "userId" is null)`);
const candOids = candidates.map((r) => toOid(r.mongoId));

// --- batch-fetch Mongo asset refs ---
const mAssets = new Map();
for (const d of await cloud
  .collection('ingredients')
  .find(
    { _id: { $in: candOids } },
    { projection: { metadata: 1, brand: 1, organization: 1, user: 1 } },
  )
  .toArray())
  mAssets.set(d._id.toString(), d);
console.log(`candidates=${candidates.length} matched in Mongo=${mAssets.size}`);

// --- batch Mongo natural-key maps for fallback ---
const brandRefs = new Set(),
  userRefs = new Set();
for (const a of mAssets.values()) {
  if (a.brand) brandRefs.add(hex(a.brand));
  if (a.user) userRefs.add(hex(a.user));
}
const mBrandSlug = new Map();
for (const b of await cloud
  .collection('brands')
  .find(
    { _id: { $in: [...brandRefs].map(toOid) } },
    { projection: { slug: 1 } },
  )
  .toArray())
  if (b.slug) mBrandSlug.set(b._id.toString(), String(b.slug).toLowerCase());
const mUserEmail = new Map();
for (const us of await auth
  .collection('users')
  .find(
    { _id: { $in: [...userRefs].map(toOid) } },
    { projection: { email: 1 } },
  )
  .toArray())
  if (us.email)
    mUserEmail.set(us._id.toString(), String(us.email).toLowerCase());

// --- resolve + update ---
const stat = {
  noMongo: 0,
  meta: 0,
  brand: 0,
  brandViaSlug: 0,
  org: 0,
  user: 0,
  userViaEmail: 0,
  updated: 0,
};
for (const ing of candidates) {
  const a = mAssets.get(ing.mongoId);
  if (!a) {
    stat.noMongo++;
    continue;
  }
  const metadataId = metaByMongo.get(hex(a.metadata)) ?? null;
  let brandId = brandByMongo.get(hex(a.brand)) ?? null;
  if (!brandId && a.brand) {
    const slug = mBrandSlug.get(hex(a.brand));
    if (slug && brandBySlug.has(slug)) {
      brandId = brandBySlug.get(slug);
      stat.brandViaSlug++;
    }
  }
  const organizationId = orgByMongo.get(hex(a.organization)) ?? null;
  let userId = userByMongo.get(hex(a.user)) ?? null;
  if (!userId && a.user) {
    const em = mUserEmail.get(hex(a.user));
    if (em && userByEmail.has(em)) {
      userId = userByEmail.get(em);
      stat.userViaEmail++;
    }
  }
  if (metadataId) stat.meta++;
  if (brandId) stat.brand++;
  if (organizationId) stat.org++;
  if (userId) stat.user++;
  if (LIVE && (metadataId || brandId || organizationId || userId)) {
    await c.query(
      `update ingredients set "metadataId"=coalesce("metadataId",$2), "brandId"=coalesce("brandId",$3),
         "organizationId"=coalesce("organizationId",$4), "userId"=coalesce("userId",$5) where id=$1`,
      [ing.id, metadataId, brandId, organizationId, userId],
    );
    stat.updated++;
  }
}
console.log(JSON.stringify(stat, null, 2));
console.log(LIVE ? 'Backfill applied.' : 'Dry run — pass --live to apply.');
await m.close();
await c.end();
