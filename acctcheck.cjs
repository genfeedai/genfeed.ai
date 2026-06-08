const PG =
  "/usr/src/app/node_modules/.bun/pg@8.21.0+089ae586d7e96dbe/node_modules/pg";
const { Client } = require(PG);

(async () => {
  const cs = process.env.DATABASE_URL;
  const c = new Client({
    connectionString: cs,
    ssl: cs.includes("sslmode=disable") ? false : { rejectUnauthorized: true },
  });
  await c.connect();
  const r = await c.query(
    'select email, "clerkId" as clerk, "isDeleted" as deleted, "createdAt" as created from users order by "createdAt"',
  );
  console.log("USERS", r.rowCount);
  for (const x of r.rows) {
    const clerk = x.clerk
      ? `${String(x.clerk).slice(0, 8)}…(len ${String(x.clerk).length})`
      : "NULL";
    console.log(
      `  ${x.email} | clerk=${clerk} | deleted=${x.deleted} | created=${x.created ? new Date(x.created).toISOString().slice(0, 10) : "?"}`,
    );
  }
  // targeted lookups
  for (const e of ["trygenfeedai@gmail.com", "vincent@genfeed.ai"]) {
    const q = await c.query(
      'select count(*)::int n from users where lower(email)=lower($1)',
      [e],
    );
    console.log(`LOOKUP ${e} => ${q.rows[0].n} row(s)`);
  }
  await c.end();
})().catch((e) =>
  console.log("DBERR", e.code || "", String(e.message).slice(0, 200)),
);
