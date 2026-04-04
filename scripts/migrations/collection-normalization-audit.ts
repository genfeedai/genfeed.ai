import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const logger = {
  log: (...args: unknown[]) => console.log(...args),
};

export const LAST_REVIEWED = '2026-03-30';

export const ORPHAN_COLLECTIONS = [
  {
    collection: 'community-threads',
    notes: [
      'Observed in production cloud.',
      'No current persisted schema owner was found in the server source tree.',
      'Inventory-only in this phase. Do not rename or drop until a live owner or deprecation path is confirmed.',
    ],
  },
  {
    collection: 'knowledge-bases',
    notes: [
      'Observed in local and production cloud.',
      'The concept is referenced in app/service code, but no current persisted schema owner was found in the server source tree.',
      'Inventory-only in this phase. Resolve ownership before any rename or cleanup.',
    ],
  },
  {
    collection: 'remote-studio-compositions',
    notes: [
      'Observed in local and production cloud.',
      'No current persisted schema owner was found in the server source tree.',
      'Inventory-only in this phase. Confirm whether this is a live product collection, a legacy artifact, or owned outside the current server schemas.',
    ],
  },
] as const;

export const CONSOLIDATION_CANDIDATES = [
  {
    notes: [
      'OrgIntegration is a real persisted schema and remains in scope for naming normalization.',
      'Credential is also a real persisted schema with broader user/brand/org auth-token semantics.',
      'Do not merge in the naming phase. Review data overlap, query ownership, and auth model boundaries as a separate consolidation project.',
    ],
    title: 'org-integrations vs credentials',
  },
  {
    notes: [
      'CRM task semantics are owned by the CRM schema and canonicalized to crm-tasks.',
      'Empty cloud.tasks leftovers should be treated as stale split-db residue.',
      'Naming phase drops only empty leftovers. Any non-empty leftovers require explicit migration planning.',
    ],
    title: 'cloud.tasks vs crm-tasks',
  },
  {
    notes: ['users', 'organizations', 'strategies', 'agent-strategies'],
    title: 'Legacy split leftovers in cloud',
  },
] as const;

export const OPERATIONAL_NOTES = [
  {
    notes: [
      'The orphan audit in `apps/server/api/scripts/mongodb/check-orphans.ts` intentionally excludes missing `ingredients.user`, `ingredients.organization`, and `ingredients.brand` on provider-backed public voice catalog records.',
      'The exemption is narrow: `category = voice`, `scope = public`, `voiceSource = catalog`, `provider` is present, and no parent. This matches `apps/server/api/scripts/seeds/voices.seed.ts` when no owner IDs are provided.',
      'Do not backfill fake owners onto those public catalog voices. Treat them as shared seed inventory until the data model is split or formalized.',
      'Schema rule: owner refs remain required for tenant-owned ingredients. They are optional only for provider-backed public catalog voices.',
      'Use `apps/server/api/scripts/mongodb/repair-catalog-voice-ownership.ts` to dry-run or repair legacy provider/voiceSource/scope drift on imported catalog voices.',
    ],
    title: 'Seeded Public Voice Catalog Audit Exemption',
  },
  {
    notes: [
      'Use `apps/server/api/scripts/mongodb/repair-post-credentials.ts` for stale post credential refs. It is dry-run by default and only reassigns when there is exactly one active same-scope credential candidate.',
      'Unrecoverable posts are soft-deleted rather than hard-deleted.',
      'Use `apps/server/api/scripts/mongodb/cleanup-broken-knowledge-bases.ts` for broken default draft knowledge bases with empty sources and missing ownership refs.',
    ],
    title: 'DB Repair Scripts',
  },
] as const;

export function renderCollectionNormalizationAudit(): string {
  const lines = [
    '# Collection Normalization Audit',
    '',
    `Last reviewed: ${LAST_REVIEWED}`,
    '',
    '## Purpose',
    '',
    'This report is intentionally read-only. It tracks database collections that do not currently have a verified persisted schema owner in `apps/server/api/src/**/schemas/*.ts`, plus consolidation candidates that should be reviewed separately from the naming cleanup.',
    '',
    '## Non-Schema-Owned / Orphan Inventory',
    '',
  ];

  for (const orphan of ORPHAN_COLLECTIONS) {
    lines.push(`### \`${orphan.collection}\``, '');
    for (const note of orphan.notes) {
      lines.push(`- ${note}`);
    }
    lines.push('');
  }

  lines.push('## Operational Notes', '');

  for (const note of OPERATIONAL_NOTES) {
    lines.push(`### ${note.title}`, '');
    for (const entry of note.notes) {
      lines.push(`- ${entry}`);
    }
    lines.push('');
  }

  lines.push('## Consolidation Candidates', '');

  for (const candidate of CONSOLIDATION_CANDIDATES) {
    lines.push(`### ${candidate.title}`, '');
    for (const note of candidate.notes) {
      lines.push(`- ${note}`);
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

export function getCollectionNormalizationAuditMarkdown(): string {
  const markdownPath = resolve(
    __dirname,
    './collection-normalization-audit.md',
  );
  return readFileSync(markdownPath, 'utf8');
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  logger.log(renderCollectionNormalizationAudit());
}
