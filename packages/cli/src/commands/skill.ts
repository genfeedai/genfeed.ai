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

export const skillCommand = new Command('skill').description(
  'Create, import, edit, fork, roll back, publish, export and archive skills'
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
