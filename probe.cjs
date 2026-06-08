const PG =
  "/usr/src/app/node_modules/.bun/pg@8.21.0+089ae586d7e96dbe/node_modules/pg";
const { Client } = require(PG);

function parse(cs) {
  const u = new URL(cs);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres",
    ssl: cs.includes("sslmode=disable") ? false : { rejectUnauthorized: true },
  };
}

(async () => {
  const base = parse(process.env.DATABASE_URL);
  if (process.env.HOST_OVERRIDE) {
    base.host = process.env.HOST_OVERRIDE;
  }
  if (process.env.USER_OVERRIDE) {
    base.user = process.env.USER_OVERRIDE;
  }
  if (process.env.PW_OVERRIDE) {
    base.password = process.env.PW_OVERRIDE;
  }
  // identity only — never the creds
  console.log("INSTANCE", base.host.split(".")[0]);
  console.log("CONFIGURED_DB", base.database);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let admin = null;
  for (let attempt = 1; attempt <= 12; attempt++) {
    const a = new Client({ ...base });
    try {
      await a.connect();
      admin = a;
      break;
    } catch (e) {
      try {
        await a.end();
      } catch {}
      if (e.code === "28P01" && attempt < 12) {
        console.log(`  (password not propagated yet, retry ${attempt}/12)`);
        await sleep(5000);
        continue;
      }
      console.log("ADMIN_CONN_ERR", e.code || "", String(e.message).slice(0, 120));
      return;
    }
  }
  if (!admin) {
    console.log("ADMIN_CONN_ERR", "no_connection");
    return;
  }
  const dbs = await admin.query(
    "select datname from pg_database where datistemplate = false order by datname",
  );
  await admin.end();
  console.log("DATABASES", dbs.rows.map((r) => r.datname).join(", "));

  for (const row of dbs.rows) {
    const db = row.datname;
    const c = new Client({ ...base, database: db });
    try {
      await c.connect();
      // count tables per schema (not just public)
      const schemas = await c.query(
        "select table_schema, count(*)::int n from information_schema.tables where table_type='BASE TABLE' and table_schema not in ('pg_catalog','information_schema') group by table_schema order by table_schema",
      );
      const t = await c.query(
        "select table_schema, table_name from information_schema.tables where table_type='BASE TABLE' and table_schema not in ('pg_catalog','information_schema')",
      );
      let total = 0;
      let nonzero = 0;
      const hits = [];
      for (const tr of t.rows) {
        const sch = tr.table_schema;
        const tbl = tr.table_name;
        try {
          const r = await c.query(`select count(*)::int n from "${sch}"."${tbl}"`);
          const n = r.rows[0].n;
          total += n;
          if (n > 0) {
            nonzero++;
            hits.push(`${sch}.${tbl}=${n}`);
          }
        } catch (e) {
          hits.push(`${sch}.${tbl}!ERR`);
        }
      }
      const schemaSummary = schemas.rows
        .map((s) => `${s.table_schema}:${s.n}`)
        .join(",");
      console.log(
        `DB ${db}: tables=${t.rows.length} (${schemaSummary}) rows=${total} nonzero=${nonzero}`,
      );
      if (nonzero) console.log(`  HITS ${hits.slice(0, 60).join(", ")}`);
    } catch (e) {
      console.log(`DB ${db}: CONN_ERR ${e.code || ""} ${String(e.message).slice(0, 80)}`);
    } finally {
      try {
        await c.end();
      } catch {}
    }
  }
})();
