# Use an approved Brand OS in an external agent

1. Open the brand's Brand Kit settings, review its Brand OS revision, and approve it.
2. Choose **Download design.md**. Save the file beside the project or content brief you want an agent to work on.
3. In Codex or Claude, attach the file or ask the agent to read it:

   > Read design.md before making changes. Use its approved positioning, voice, visual rules and content principles. Treat extracted evidence as sourced guidance, inferred evidence as a recommendation, and accepted-candidate evidence as a choice approved by the brand. Ask about missing guidance instead of inventing a brand fact. Produce a short landing-page content outline, and identify which approved rules support each section.

The artifact is plain UTF-8 Markdown and needs no conversion. Its `Brand`, `Revision`, `Schema version`, and `Generated at` lines identify the exact approval snapshot. The download response includes a SHA-256 `Content-Digest` and an ETag. Generation time is the revision's approval time, so repeated downloads of the same revision and visibility have identical bytes and digest.

## Optional public access

A brand administrator can choose **Publish** to expose the approved document at the URL shown in settings. Give this URL to an agent that can fetch public web pages, or retrieve it with `curl --fail --location 'PUBLIC_URL' --output design.md` and follow the file workflow above.

Publication is explicit. Approving another revision does not update that URL. **Publish latest revision** changes the stable URL to the selected approved revision. The revision URL identifies immutable bytes, and previously published revision URLs remain available until publishing is revoked. **Revoke** disables the stable URL and every revision URL immediately at the API boundary. Responses use `Cache-Control: no-store`; consumers that independently save a copy must remove their own copies. Republishing after revocation exposes only the newly selected revision, without restoring old revision URLs.

## Export boundaries

Only allowlisted approved field values are included. Draft proposals, unaccepted asset candidates, credentials, private prompt guidelines, raw website captures, evidence excerpts, diagnostics, and membership information are excluded. URLs are omitted unless they come from public website evidence and pass a conservative HTTPS policy. Private uploads and signed URLs remain omitted even in authenticated downloads. Evidence classifications remain visible when a URL is omitted.

A missing optional section is labeled `missing`. Missing brand identity, invalid field types, control characters, overlong strings or arrays, and artifacts over 128 KB fail closed. The system never silently truncates approved rules. Current limits are 8,000 characters per string and 50 items per array or source list.

Authenticated members can download. Only current organization owners and administrators with brand access can publish, update publication or revoke. Anonymous private access, tenant mismatch, revoked publication and deleted brands return a generic not-found response. Published artifacts are excluded from indexing through response headers.

## Verification

The helper privacy corpus covers both private and public visibility. Service tests exercise private download, explicit publication, approval without republishing, immutable history, revocation, re-enable, membership denial, tenant movement, retries and content-free audits. HTTP tests run the real Nest controllers, validation pipe and service with simulated authentication and in-memory persistence. The optional PostgreSQL acceptance suite runs the actual migration and service in an isolated schema, including concurrent publication and 30 warm reads with database and audit-write latency. Run it with `BRAND_OS_TEST_DATABASE_URL` pointing to a local test database. Deployed latency still requires operational measurement.
