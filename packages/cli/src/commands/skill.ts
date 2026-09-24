import { Command } from 'commander';

import { get, patch, post, requireAuth } from '@/api/client';
import { printJson } from '@/ui/theme';
import { handleError } from '@/utils/errors';

async function run(action: () => Promise<unknown>): Promise<void> {
  try {
    await requireAuth();
    printJson(await action());
  } catch (error) {
    handleError(error);
  }
}

export const skillCommand = new Command('skill').description(
  'Create, share, publish, export, and uninstall scoped skills'
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
  .requiredOption('--name <name>')
  .requiredOption('--slug <slug>')
  .requiredOption('--description <description>')
  .requiredOption('--instructions <instructions>')
  .action(
    async (options: { description: string; instructions: string; name: string; slug: string }) => {
      await run(() =>
        post('/skills/import', {
          category: 'content',
          channels: ['general'],
          defaultInstructions: options.instructions,
          description: options.description,
          modalities: ['text'],
          name: options.name,
          slug: options.slug,
          systemPromptTemplate: options.instructions,
          workflowStage: 'creation',
        })
      );
    }
  );

skillCommand
  .command('edit')
  .argument('<id>')
  .option('--name <name>')
  .option('--description <description>')
  .option('--instructions <instructions>')
  .action(
    async (id: string, options: { description?: string; instructions?: string; name?: string }) => {
      await run(() =>
        patch(`/skills/${id}`, {
          ...(options.description ? { description: options.description } : {}),
          ...(options.instructions
            ? {
                defaultInstructions: options.instructions,
                systemPromptTemplate: options.instructions,
              }
            : {}),
          ...(options.name ? { name: options.name } : {}),
        })
      );
    }
  );

skillCommand
  .command('rollback')
  .argument('<id>')
  .requiredOption('--version <versionId>')
  .action(async (id: string, options: { version: string }) => {
    await run(() => post(`/skills/${id}/rollback`, { versionId: options.version }));
  });
