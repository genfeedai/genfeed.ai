const PG =
  "/usr/src/app/node_modules/.bun/pg@8.21.0+089ae586d7e96dbe/node_modules/pg";
const { Client } = require(PG);

(async () => {
  const cs = process.env.DATABASE_URL;
  const c = new Client({
    connectionString: cs,
    ssl: cs.includes("sslmode=disable") ? false : { rejectUnauthorized: true },
  });
  try {
    await c.connect();
    const u = await c.query("select count(*)::int n from users");
    const o = await c.query("select count(*)::int n from organizations");
    const b = await c.query("select count(*)::int n from brands");
    console.log(
      `DATA users=${u.rows[0].n} orgs=${o.rows[0].n} brands=${b.rows[0].n}`,
    );
    const m = await c.query(
      "select migration_name, finished_at is not null as done from _prisma_migrations order by started_at",
    );
    console.log("MIGRATIONS", m.rowCount);
    for (const row of m.rows) {
      console.log(`  ${row.done ? "OK " : "?? "}${row.migration_name}`);
    }
  } catch (e) {
    console.log("ERR", e.code || "", String(e.message).slice(0, 160));
  } finally {
    try {
      await c.end();
    } catch {}
  }
})();
