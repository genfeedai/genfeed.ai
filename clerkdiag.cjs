/* Diagnose Clerk instance vs DB clerkId drift. Prints NO secrets — only
   instance type (test/live), the PUBLIC frontend domain, emails + clerkIds. */
const PG =
  "/usr/src/app/node_modules/.bun/pg@8.21.0+089ae586d7e96dbe/node_modules/pg";
const { Client } = require(PG);
const { createClerkClient } = require("@clerk/backend");

const EMAILS = ["trygenfeedai@gmail.com", "vincent@genfeed.ai"];

function instanceType(sk) {
  if (!sk) return "MISSING";
  if (sk.startsWith("sk_live")) return "live";
  if (sk.startsWith("sk_test")) return "test";
  return "unknown";
}

function pubDomain(pk) {
  // pk_(test|live)_<base64("<domain>$")> — domain is PUBLIC (shipped to browser)
  try {
    const b64 = pk.replace(/^pk_(test|live)_/, "");
    const decoded = Buffer.from(b64, "base64").toString("utf8");
    return decoded.replace(/\$$/, "");
  } catch {
    return "UNPARSEABLE";
  }
}

(async () => {
  const sk = process.env.CLERK_SECRET_KEY || "";
  const pk = process.env.CLERK_PUBLISHABLE_KEY || "";
  console.log("CLERK_SECRET instance:", instanceType(sk));
  console.log("CLERK_PUBLISHABLE present:", pk ? "yes" : "NO");
  console.log("CLERK frontend domain (public):", pk ? pubDomain(pk) : "n/a");

  // ---- DB side: full clerkId per email ----
  const cs = process.env.DATABASE_URL;
  const c = new Client({
    connectionString: cs,
    ssl: cs.includes("sslmode=disable") ? false : { rejectUnauthorized: true },
  });
  await c.connect();
  const dbByEmail = {};
  for (const e of EMAILS) {
    const r = await c.query(
      'select email, "clerkId" as clerk from users where lower(email)=lower($1)',
      [e],
    );
    dbByEmail[e.toLowerCase()] = r.rows[0] ? r.rows[0].clerk : null;
  }
  await c.end();

  // ---- Clerk side: does current instance know these emails + what clerkId ----
  let clerk;
  try {
    clerk = createClerkClient({ publishableKey: pk, secretKey: sk });
  } catch (e) {
    console.log("CLERK client init FAIL:", String(e.message).slice(0, 120));
    return;
  }

  try {
    const total = await clerk.users.getUserList({ limit: 1 });
    console.log("CLERK instance totalUsers:", total.totalCount);
  } catch (e) {
    console.log(
      "CLERK list FAIL:",
      e.status || "",
      String(e.message || e).slice(0, 140),
    );
  }

  for (const e of EMAILS) {
    const dbClerk = dbByEmail[e.toLowerCase()];
    let line = `\n[${e}]\n  DB.clerkId:    ${dbClerk || "NONE (no DB row)"}`;
    try {
      const res = await clerk.users.getUserList({ emailAddress: [e] });
      if (!res.data.length) {
        line += `\n  Clerk:         NOT FOUND in current instance`;
      } else {
        for (const u of res.data) {
          const created = u.createdAt
            ? new Date(u.createdAt).toISOString().slice(0, 10)
            : "?";
          const match = dbClerk && dbClerk === u.id ? "  <-- MATCHES DB" : "";
          line += `\n  Clerk.id:      ${u.id} (created ${created})${match}`;
        }
      }
    } catch (err) {
      line += `\n  Clerk lookup FAIL: ${err.status || ""} ${String(err.message || err).slice(0, 120)}`;
    }
    console.log(line);
  }
})().catch((e) => console.log("FATAL", String(e.message || e).slice(0, 200)));
