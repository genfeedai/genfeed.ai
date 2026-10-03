# Migration and release compatibility

Hosted deployment runs the candidate API and worker boot smoke **before live
migrations**, then snapshots RDS, migrates, and rolls services. A rejected boot
leaves the live schema untouched. Startup that requires an added column must
follow an earlier expand release; this deliberately fails closed rather than
migrating ahead of an image that cannot boot. The existing smoke starts the full
application against production dependencies; it is not a migration simulation or
an exhaustive query check.

Use expand/contract for schema retirement:

1. Expand with nullable columns/defaults while the serving client still works.
2. Ship a stable release whose generated Prisma client no longer selects retired
   fields/tables, or whose writes satisfy the future required-field invariant.
3. In a later release, add a separate contract migration with this SQL comment:

   ```sql
   -- genfeed-contract-after: v0.2.0
   ALTER TABLE "examples" DROP COLUMN "retiredField";
   ```

The CI Static Checks guard validates every newly added migration in the diff.
`DROP COLUMN` (including PostgreSQL's shorthand), `DROP TABLE`, and `SET NOT NULL`
require exactly one marker. The named release must be published, stable, and an
ancestor of the diff base. Its Prisma schema must exclude **every** dropped
field/table and require every column tightened to `NOT NULL` on an existing
model. A marker cannot excuse a second incompatible operation in the same file.
Schema-qualified operations support `public`; dynamic `EXECUTE` migrations fail
closed because concatenated SQL cannot be proved by this guard. Review raw SQL
application reads/writes separately; generated-schema checks cannot prove them.
A published release alone does not prove all currently serving ECS revisions
contain the retirement (for example, after an intentional rollback). Before boot
and live migrations, the deploy gate enumerates configured services, PRIMARY /
ACTIVE deployments and task sets, and actual pending/running/draining tasks. It
inspects each immutable image's OCI source revision without pulling the image,
fetches that revision's Prisma schema, and checks candidate contracts against
**every** serving client. Missing source metadata or unsupported migration
history fails closed. A reverse check blocks rollback clients that select fields
contracted by the active release. It uses read-only AWS/registry calls and starts
no extra tasks or infrastructure. The canonical image builder generates Prisma
from that source revision; custom images without that provenance cannot pass.

The existing deploy concurrency group serializes hosted releases; external
out-of-band ECS changes during the verification/migration window are unsupported.
Do not roll back to a release predating the retirement marker after contracting.

Applied migration files are immutable, including their comments: Prisma records
checksums. CI rejects edits/deletions/renames to SQL present at the diff base.
Repair historical mistakes with a reviewed forward migration or compatible
application release, never by rewriting an applied file.

## Historical audit for #5881

| Migration | Assessment | Safe split for equivalent future work |
| --- | --- | --- |
| `20260923090000_derive_ingredient_media_url` | Noncompliant: backfill and `ingredients.cdnUrl` removal shipped with the client retirement in #4975. No earlier compatible release is established. | Backfill/derive URLs first, publish the client without `cdnUrl`, then drop in a later release. |
| `20260926090000_member_current_brand` | Noncompliant: adds/backfills `members.currentBrandId`, sets it required, and drops `members.lastUsedBrandId` / `brands.isSelected` with the client switch in #5232. Backfill does not make old inserts satisfy the new invariant. | Add nullable column/backfill; publish writers and client retirement; enforce requiredness and drop old fields in a later release. |
| `20260929120000_drop_retired_fastlane_setting` | The intended contract after v0.1.77 was not enforced: #5766 recorded an old client selecting `isFastlaneEnabled`. Current production recovery is verified by the #5766 lane: the active API image maps to canonical Release v0.2.0 source `40c8392e`, the rollout completed on 2026-10-02, and no matching production schema errors were found since rollout. This confirms current recovery, not historical rollout compliance. | Verify every serving API/worker uses the no-reader release before applying the separate contract. |

These applied migrations retain their original checksums. This audit records
violations rather than certifying them retroactively. Historical unsafe rollout cannot be certified retrospectively. The serving-image
gate prevents future incompatible contracts without rewriting those files;
production repair, when needed, remains a reviewed forward change. No deployment, snapshot restore, or schema repair is performed
by adding this guard.
