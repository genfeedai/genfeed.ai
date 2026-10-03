import type {
  SkillVersionListQueryV1,
  SkillVersionMetadataV1,
  SkillVersionReadPageV1,
  SkillVersionReadV1,
} from '@genfeedai/contracts/interfaces/ai/skill-version-read.interface';
import { Command } from 'commander';

import { get, patch, post, requireAuth } from '@/api/client';
import { printJson } from '@/ui/theme';
import { GenfeedError, handleError } from '@/utils/errors';
import { readSkillPackageInput, type SkillPackageInputOptions } from '@/utils/skill-package-input';

async function run(action: () => Promise<unknown>): Promise<void> {
  try {
    await requireAuth();
    printJson(await action());
  } catch (error) {
    handleError(error);
  }
}

function versionReadInvalid(): never {
  throw new GenfeedError('Skill versions are unavailable.');
}
function versionObject(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return versionReadInvalid();
  const record = input as Record<string, unknown>;
  const actual = Reflect.ownKeys(record);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    return versionReadInvalid();
  return record;
}
function versionInteger(input: unknown, maximum = 2147483647): number {
  if (typeof input !== 'number' || !Number.isInteger(input) || input < 1 || input > maximum)
    return versionReadInvalid();
  return input;
}
function versionSkillIdentity(skillId: string): void {
  if (typeof skillId !== 'string' || !skillId || skillId !== skillId.trim()) versionReadInvalid();
}
function versionQuery(
  query: SkillVersionListQueryV1
): Required<Pick<SkillVersionListQueryV1, 'limit'>> & SkillVersionListQueryV1 {
  if (
    !query ||
    typeof query !== 'object' ||
    Array.isArray(query) ||
    Reflect.ownKeys(query).some((key) => key !== 'limit' && key !== 'beforeVersionNumber')
  )
    return versionReadInvalid();
  return {
    limit: Object.hasOwn(query, 'limit') ? versionInteger(query.limit, 50) : 20,
    ...(Object.hasOwn(query, 'beforeVersionNumber')
      ? { beforeVersionNumber: versionInteger(query.beforeVersionNumber) }
      : {}),
  };
}
function versionLinks(input: unknown, collection: boolean): Record<string, unknown> {
  const links = versionObject(input, collection ? ['self', 'cursor'] : ['self']);
  if (typeof links.self !== 'string' || !links.self.trim()) versionReadInvalid();
  return links;
}
function versionMetadata(input: unknown, skillId: string, detail: boolean): SkillVersionMetadataV1 {
  const row = versionObject(input, ['type', 'id', 'attributes']);
  const attributes = versionObject(
    row.attributes,
    detail
      ? ['versionNumber', 'createdAt', 'contentHash', 'instructionText']
      : ['versionNumber', 'createdAt', 'contentHash']
  );
  const versionNumber = versionInteger(attributes.versionNumber);
  if (
    row.type !== 'skill-version' ||
    typeof row.id !== 'string' ||
    row.id !== `sv1_${skillId}_${versionNumber}` ||
    typeof attributes.contentHash !== 'string' ||
    attributes.contentHash.length !== 80 ||
    !/^sha256:skill-v1:[a-f0-9]{64}$/.test(attributes.contentHash) ||
    typeof attributes.createdAt !== 'string'
  )
    return versionReadInvalid();
  const createdAt = new Date(attributes.createdAt);
  if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== attributes.createdAt)
    return versionReadInvalid();
  return {
    contentHash: attributes.contentHash,
    createdAt: attributes.createdAt,
    id: row.id,
    versionNumber,
  };
}
function parseSkillVersionReadPageV1(
  input: unknown,
  skillId: string,
  query: SkillVersionListQueryV1 = {}
): SkillVersionReadPageV1 {
  versionSkillIdentity(skillId);
  const requested = versionQuery(query);
  const wire = versionObject(input, ['data', 'links']);
  const links = versionLinks(wire.links, true);
  const cursor = versionObject(links.cursor, ['limit', 'hasMore', 'nextCursor']);
  if (
    !Array.isArray(wire.data) ||
    wire.data.length > requested.limit ||
    cursor.limit !== requested.limit ||
    typeof cursor.hasMore !== 'boolean'
  )
    return versionReadInvalid();
  const items = wire.data.map((row) => versionMetadata(row, skillId, false));
  let previous = requested.beforeVersionNumber ?? 2147483648;
  for (const item of items) {
    if (item.versionNumber >= previous) versionReadInvalid();
    previous = item.versionNumber;
  }
  if (cursor.hasMore !== (cursor.nextCursor !== null)) return versionReadInvalid();
  const nextCursor = cursor.nextCursor === null ? null : versionInteger(cursor.nextCursor);
  if (
    cursor.hasMore &&
    (items.length !== requested.limit ||
      nextCursor !== items[items.length - 1]?.versionNumber ||
      nextCursor === 1)
  )
    return versionReadInvalid();
  return { hasMore: cursor.hasMore, items, limit: requested.limit, nextCursor };
}
function parseSkillVersionReadV1(
  input: unknown,
  skillId: string,
  versionId: string
): SkillVersionReadV1 {
  versionSkillIdentity(skillId);
  const wire = versionObject(input, ['data', 'links']);
  versionLinks(wire.links, false);
  const metadata = versionMetadata(wire.data, skillId, true);
  const row = versionObject(wire.data, ['type', 'id', 'attributes']);
  const attributes = versionObject(row.attributes, [
    'versionNumber',
    'createdAt',
    'contentHash',
    'instructionText',
  ]);
  if (metadata.id !== versionId || typeof attributes.instructionText !== 'string')
    return versionReadInvalid();
  return { ...metadata, instructionText: attributes.instructionText };
}

function versionFlag(input: string, maximum: number, flag: string): number {
  if (
    !/^[1-9][0-9]*$/.test(input) ||
    input.length > 10 ||
    String(Number(input)) !== input ||
    Number(input) > maximum
  ) {
    throw new GenfeedError(`Invalid ${flag}`, `Use a canonical integer from 1 to ${maximum}`);
  }
  return Number(input);
}
function versionRequestedId(skillId: string, versionId: string): void {
  versionSkillIdentity(skillId);
  const prefix = `sv1_${skillId}_`;
  const suffix = versionId.slice(prefix.length);
  if (!versionId.startsWith(prefix) || !/^[1-9][0-9]*$/.test(suffix) || suffix.length > 10) {
    throw new GenfeedError(
      'Invalid version ID',
      'Use the complete sv1 ID returned by skill versions'
    );
  }
  const number = versionInteger(Number(suffix));
  if (versionId !== `${prefix}${number}`) {
    throw new GenfeedError(
      'Invalid version ID',
      'Use the complete sv1 ID returned by skill versions'
    );
  }
}

export const skillCommand = new Command('skill').description(
  'Create, import, edit, fork, roll back, publish, export, archive and read skill versions'
);

skillCommand
  .command('create')
  .requiredOption('--name <name>')
  .requiredOption('--slug <slug>')
  .requiredOption('--description <description>')
  .requiredOption('--instructions <instructions>')
  .option('--owner <owner>', 'user, organization, or brand', 'user')
  .action(
    async (options: {
      description: string;
      instructions: string;
      name: string;
      owner: string;
      slug: string;
    }) => {
      const ownerKind =
        options.owner === 'organization' || options.owner === 'brand' ? options.owner : 'user';
      await run(() =>
        post('/skills/scoped', {
          description: options.description,
          instructions: options.instructions,
          name: options.name,
          ownerKind,
          slug: options.slug,
        })
      );
    }
  );

skillCommand
  .command('fork')
  .argument('<id>')
  .action(async (id: string) => {
    await run(() => post(`/skills/${id}/fork`, {}));
  });

skillCommand
  .command('export')
  .argument('<id>')
  .action(async (id: string) => {
    await run(() => get(`/skills/${id}/export`));
  });

skillCommand
  .command('publish')
  .argument('<id>')
  .option('--audience <audience>', 'organization or public', 'organization')
  .action(async (id: string, options: { audience: string }) => {
    const audience = options.audience === 'public' ? 'public' : 'organization';
    await run(() => post(`/skills/${id}/publish`, { audience }));
  });

skillCommand
  .command('archive')
  .argument('<id>')
  .action(async (id: string) => {
    await run(() => post(`/skills/${id}/archive`, {}));
  });

skillCommand
  .command('import')
  .description(
    'Import a private skill from root SKILL.md and Markdown references, or a bounded ZIP package'
  )
  .argument('<SKILL.md-or-package.zip>', 'Local root SKILL.md or ZIP file; no directory traversal')
  .requiredOption('--slug <slug>', 'Personal skill slug')
  .option(
    '--reference <relative-markdown-path...>',
    'Markdown files relative to the SKILL.md directory; may be repeated'
  )
  .option('--source-url <url>', 'HTTP(S) provenance URL; never fetched by the CLI')
  .option(
    '--checksum <package-sha256>',
    'Expected package content SHA256, optionally prefixed sha256:'
  )
  .action(async (filePath: string, options: SkillPackageInputOptions) => {
    await run(async () => post('/skills/import', await readSkillPackageInput(filePath, options)));
  });

skillCommand
  .command('edit')
  .description('Update only supplied fields; supply at least one edit option')
  .argument('<id>')
  .option('--name <name>', 'Name (maximum 140 characters)')
  .option('--description <description>', 'Description (maximum 2000 characters; may be empty)')
  .option(
    '--instructions <instructions>',
    'Set both defaultInstructions and systemPromptTemplate (maximum 8000 characters; may be empty)'
  )
  .action(
    async (id: string, options: { description?: string; instructions?: string; name?: string }) => {
      await run(async () => {
        if (
          options.description === undefined &&
          options.instructions === undefined &&
          options.name === undefined
        ) {
          throw new GenfeedError(
            'Supply at least one edit option',
            'Use --name, --description or --instructions with skill edit <id>'
          );
        }
        return patch(`/skills/${encodeURIComponent(id)}`, {
          ...(options.description !== undefined ? { description: options.description } : {}),
          ...(options.instructions !== undefined
            ? {
                defaultInstructions: options.instructions,
                systemPromptTemplate: options.instructions,
              }
            : {}),
          ...(options.name !== undefined ? { name: options.name } : {}),
        });
      });
    }
  );

skillCommand
  .command('rollback')
  .argument('<id>')
  .requiredOption('--version <versionId>')
  .action(async (id: string, options: { version: string }) => {
    await run(() => post(`/skills/${id}/rollback`, { versionId: options.version }));
  });

skillCommand
  .command('versions')
  .description('Read one bounded page of immutable version metadata; no automatic pagination')
  .argument('<id>')
  .option('--limit <limit>', 'Canonical integer 1..50 (default 20)', '20')
  .option(
    '--before-version-number <number>',
    'Canonical integer 1..2147483647; read older versions'
  )
  .action(async (id: string, options: { limit: string; beforeVersionNumber?: string }) => {
    await run(async () => {
      versionSkillIdentity(id);
      const query: SkillVersionListQueryV1 = {
        limit: versionFlag(options.limit, 50, '--limit'),
        ...(options.beforeVersionNumber !== undefined
          ? {
              beforeVersionNumber: versionFlag(
                options.beforeVersionNumber,
                2147483647,
                '--before-version-number'
              ),
            }
          : {}),
      };
      const search = new URLSearchParams({ limit: String(query.limit) });
      if (query.beforeVersionNumber !== undefined)
        search.set('beforeVersionNumber', String(query.beforeVersionNumber));
      const response = await get<unknown>(`/skills/${encodeURIComponent(id)}/versions?${search}`);
      return parseSkillVersionReadPageV1(response, id, query);
    });
  });

skillCommand
  .command('version')
  .description('Read exact immutable instruction text for a complete sv1 version ID')
  .argument('<id>')
  .argument('<versionId>', 'Complete sv1 ID returned by skill versions')
  .action(async (id: string, versionId: string) => {
    await run(async () => {
      versionRequestedId(id, versionId);
      const response = await get<unknown>(
        `/skills/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`
      );
      return parseSkillVersionReadV1(response, id, versionId);
    });
  });
