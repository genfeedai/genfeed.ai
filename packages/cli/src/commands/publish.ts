import { checkbox, input } from '@inquirer/prompts';
import { Command } from 'commander';
import ora from 'ora';
import { get, post, requireAuth } from '@/api/client.js';
import {
  flattenCollection,
  flattenSingle,
  type JsonApiCollectionResponse,
  type JsonApiSingleResponse,
} from '@/api/json-api.js';
import { formatSuccess, formatWarning, print } from '@/ui/theme.js';
import { GenfeedError, handleError } from '@/utils/errors.js';

interface PublishResponse {
  id: string;
}

interface Credential {
  id: string;
  handle?: string;
  isConnected?: boolean;
  label?: string;
  platform?: string;
}

function parsePlatforms(raw: string | undefined): string[] {
  if (!raw) return [];

  return [
    ...new Set(
      raw
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

function credentialLabel(credential: Credential): string {
  const base = credential.label ?? credential.handle ?? credential.id;
  const platform = credential.platform ? ` (${credential.platform})` : '';
  return `${base}${platform}`;
}

export const publishCommand = new Command('publish')
  .description('Publish content to social media platforms')
  .argument('<ingredientId>', 'ID of the content to publish')
  .option('-p, --platforms <platforms>', 'Comma-separated platforms (twitter,instagram,linkedin)')
  .option('--credential <id>', 'Credential ID to publish with')
  .option('-c, --caption <caption>', 'Post caption')
  .option('--status <status>', 'Post status (scheduled or draft)', 'scheduled')
  .option('--scheduled-date <iso>', 'Scheduled date in ISO-8601 format')
  .option('--json', 'Output as JSON')
  .action(async (ingredientId, options) => {
    try {
      await requireAuth();

      const spinner = ora('Fetching connected accounts...').start();
      const credentialsResponse = await get<JsonApiCollectionResponse>('/credentials');
      const credentials = flattenCollection<Credential>(credentialsResponse);
      spinner.stop();

      const connectedCredentials = credentials.filter(
        (credential) => credential.isConnected !== false
      );
      if (connectedCredentials.length === 0) {
        print(formatWarning('No connected social accounts found.'));
        print(formatWarning('Connect an account first in the Genfeed web app.'));
        return;
      }

      let selectedCredentials: Credential[] = [];

      if (options.credential) {
        const selected = connectedCredentials.find(
          (credential) => credential.id === options.credential
        );
        if (!selected) {
          throw new GenfeedError(
            `Credential not found or not connected: ${options.credential}`,
            'Use `gf publish <ingredientId>` without --credential to pick from connected accounts.'
          );
        }
        selectedCredentials = [selected];
      } else {
        const platforms = parsePlatforms(options.platforms);

        if (platforms.length > 0) {
          selectedCredentials = platforms
            .map((platform) =>
              connectedCredentials.find(
                (credential) => credential.platform?.toLowerCase() === platform
              )
            )
            .filter((credential): credential is Credential => Boolean(credential));

          const resolvedPlatforms = new Set(
            selectedCredentials.map((credential) => credential.platform?.toLowerCase())
          );
          const missingPlatforms = platforms.filter((platform) => !resolvedPlatforms.has(platform));
          for (const platform of missingPlatforms) {
            print(formatWarning(`No connected credential found for platform: ${platform}`));
          }
        } else {
          const selectedIds = await checkbox({
            choices: connectedCredentials.map((credential) => ({
              name: credentialLabel(credential),
              value: credential.id,
            })),
            message: 'Select connected account(s) to publish with:',
          });

          selectedCredentials = connectedCredentials.filter((credential) =>
            selectedIds.includes(credential.id)
          );
        }
      }

      if (selectedCredentials.length === 0) {
        print(formatWarning('No publish targets selected.'));
        return;
      }

      let description: string = options.caption ?? '';
      if (!description) {
        description = await input({
          message: 'Post caption (optional):',
        });
      }

      const createSpinner = ora(
        `Publishing to ${selectedCredentials.length} account(s)...`
      ).start();
      const results: Array<{
        credentialId: string;
        platform: string;
        postId: string;
      }> = [];
      const failures: Array<{
        credentialId: string;
        error: string;
        platform: string;
      }> = [];

      const nowIso = new Date().toISOString();
      const status = String(options.status || 'scheduled').toLowerCase();

      for (const credential of selectedCredentials) {
        const payload: Record<string, unknown> = {
          credential: credential.id,
          description,
          ingredients: [ingredientId],
          label: description ? description.slice(0, 80) : `CLI post ${nowIso}`,
          status,
        };

        if (status === 'scheduled') {
          payload.scheduledDate = options.scheduledDate ?? nowIso;
          payload.timezone = 'UTC';
        }

        try {
          const response = await post<JsonApiSingleResponse>('/posts', payload);
          const result = flattenSingle<PublishResponse>(response);
          results.push({
            credentialId: credential.id,
            platform: credential.platform ?? 'unknown',
            postId: result.id,
          });
        } catch (error) {
          failures.push({
            credentialId: credential.id,
            error: error instanceof Error ? error.message : String(error),
            platform: credential.platform ?? 'unknown',
          });
        }
      }

      createSpinner.stop();

      if (options.json) {
        print(
          JSON.stringify(
            {
              failures,
              results,
            },
            null,
            2
          )
        );
        return;
      }

      for (const result of results) {
        print(
          formatSuccess(
            `Created post ${result.postId} for ${result.platform} (${result.credentialId})`
          )
        );
      }

      for (const failure of failures) {
        print(
          formatWarning(
            `Failed for ${failure.platform} (${failure.credentialId}): ${failure.error}`
          )
        );
      }

      if (results.length === 0) {
        throw new GenfeedError('Failed to create any posts for publishing targets.');
      }

      if (failures.length > 0) {
        print(formatWarning(`${failures.length} target(s) failed.`));
      }
    } catch (error) {
      handleError(error);
    }
  });
