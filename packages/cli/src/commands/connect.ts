import { Command } from 'commander';
import ora from 'ora';
import { executeAgentTool } from '@/api/agent-tools';
import { requireAuth } from '@/api/client';
import { requireGenerationBrand } from '@/commands/generate/helpers';
import { formatLabel, formatSuccess, print, printJson } from '@/ui/theme';
import { openExternalUrl } from '@/utils/browser';
import { GenfeedError, handleError } from '@/utils/errors';

const POLL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

async function waitForAuthorization(
  connectionId: string,
  timeoutMs: number,
  signal: AbortSignal
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal.aborted) {
      throw new GenfeedError('Connection wait cancelled.');
    }
    const status = await executeAgentTool('get_connection_status', { connectionId }, signal);
    const state = readString(status.data?.state);
    if (state === 'authorized') {
      return status.data ?? {};
    }
    if (state === 'denied' || state === 'failed' || state === 'expired') {
      throw new GenfeedError(
        readString(status.error) ?? `Connection ${state}. Retry connect_social_account.`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new GenfeedError('Timed out waiting for social authorization.');
}

export const connectCommand = new Command('connect')
  .description('Connect a social publishing account from the terminal')
  .argument('<platform>', 'Platform: twitter, instagram, youtube, tiktok, linkedin, facebook')
  .option('-b, --brand <id>', 'Brand ID (overrides active brand)')
  .option('--no-wait', 'Print the authorization URL and exit')
  .option('--json', 'Output as JSON')
  .action(async (platform, options) => {
    const controller = new AbortController();
    try {
      await requireAuth();
      const brandId = await requireGenerationBrand(options.brand);
      const spinner = options.json ? undefined : ora('Starting connection...').start();
      const started = await executeAgentTool(
        'connect_social_account',
        { brandId, platform },
        controller.signal
      );
      if (!started.success) {
        spinner?.fail(started.error ?? 'Could not start connection');
        throw new GenfeedError(started.error ?? 'Could not start connection');
      }

      const authorizationUrl = readString(started.data?.authorizationUrl);
      const connectionId = readString(started.data?.connectionId);
      if (!authorizationUrl || !connectionId) {
        spinner?.fail('Connection request was missing an authorization URL');
        throw new GenfeedError('Connection request was missing an authorization URL');
      }

      if (options.json && !options.wait) {
        printJson(started.data);
        return;
      }

      spinner?.succeed('Open the browser URL to authorize the account');
      print(formatLabel('Connection', connectionId));
      print(formatLabel('URL', authorizationUrl));
      await openExternalUrl(authorizationUrl);

      if (!options.wait) {
        print(
          formatLabel('Status', `Poll get_connection_status with connectionId ${connectionId}`)
        );
        return;
      }

      spinner?.start('Waiting for authorization...');
      const completed = await waitForAuthorization(
        connectionId,
        DEFAULT_TIMEOUT_MS,
        controller.signal
      );
      spinner?.succeed('Account connected');
      if (options.json) {
        printJson(completed);
        return;
      }
      print(formatSuccess('Account connected. Return to your original task.'));
      print(formatLabel('Account', readString(completed.externalHandle) ?? connectionId));
    } catch (error) {
      handleError(error);
    } finally {
      controller.abort();
    }
  });
