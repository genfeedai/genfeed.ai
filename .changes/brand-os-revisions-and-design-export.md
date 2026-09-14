packages: @genfeedai/contracts @genfeedai/harness @genfeedai/helpers @genfeedai/pages @genfeedai/prisma @genfeedai/props @genfeedai/serializers @genfeedai/services

Add durable Brand OS revision and publication contracts, their serializers,
Brand Kit revision/history controls, and authenticated revision/export methods
on BrandsService. The existing scan and manual-kit components gain optional
onDraftCreated callbacks; existing callers may omit them.

ContentHarnessInput accepts an optional approved revision identity and contribution.
Composed brief receipts identify the approved Brand OS revision, or record
brandOs: none when generation falls back to the legacy profile. Existing stored
briefs may lack receipts. Once a revision is approved, its identity is authoritative;
legacy voice settings outside the snapshot are no longer merged into generation.

The deterministic design.md builder is available from
@genfeedai/helpers/brand-os-design-export.helper. It imports node:crypto and must
remain a server-only subpath rather than a browser helper barrel export. Export
only approved snapshots; preserve the safe-source and private-data exclusions.

Deploy the 20260914150000_brand_os_revisions Prisma migration and regenerate the
Prisma client before starting the new API. Existing brands initialize a draft on
first history access; claims persist drafts immediately. Consumers editing or
approving revisions must send updatedAt for optimistic concurrency. Editing an
approved revision creates a new draft, leaving the approved snapshot immutable.

Publication is an explicit owner/admin operation; API keys also need the explicit
admin scope. Approval never updates a published URL automatically. Public URLs
stay on the explicitly published revision until updated, and revocation disables
both stable and revision URLs. Republishing re-enables the stable URL for the
selected revision without restoring other revoked revision URLs.
