import chalk from 'chalk';
import { Command } from 'commander';
import { requireAuth } from '@/api/client.js';
import { listThreads } from '@/api/threads.js';
import { answerPendingInput } from '@/shell/agent-run.js';
import { archiveThreadAndPrint, runAgentShell, showThreadSummary } from '@/shell/agent-shell.js';
import { formatHeader, formatLabel, print, printJson } from '@/ui/theme.js';
import { handleError } from '@/utils/errors.js';

async function readAnswerFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8').trim();
}

export const threadsCommand = new Command('threads')
  .description('Inspect and resume agent threads')
  .addCommand(
    new Command('list')
      .description('List recent agent threads')
      .option('--status <status>', 'Filter by status (active, archived)')
      .option('--json', 'Output as JSON')
      .action(async (options) => {
        try {
          await requireAuth();
          const threads = await listThreads(options.status);

          if (options.json) {
            printJson(threads);
            return;
          }

          if (threads.length === 0) {
            print(chalk.dim('No threads found.'));
            return;
          }

          print(formatHeader('Threads\n'));
          for (const thread of threads) {
            const title = thread.title || thread.lastAssistantPreview || 'Untitled thread';
            print(`  ${chalk.cyan(title)} ${chalk.dim(`(${thread.id})`)}`);
            print(formatLabel('Status', thread.status ?? 'unknown'));
            if (thread.runStatus) {
              print(formatLabel('Run', thread.runStatus));
            }
            if (thread.lastAssistantPreview) {
              print(`  ${chalk.dim(thread.lastAssistantPreview)}`);
            }
            print(`  ${chalk.dim(`Resume: gf chat --thread ${thread.id}`)}`);
            print();
          }
        } catch (error) {
          handleError(error);
        }
      })
  )
  .addCommand(
    new Command('show')
      .description('Show thread details')
      .argument('<threadId>', 'Thread ID')
      .action(async (threadId) => {
        try {
          await requireAuth();
          await showThreadSummary(threadId);
        } catch (error) {
          handleError(error);
        }
      })
  )
  .addCommand(
    new Command('resume')
      .description('Resume a thread in the interactive agent shell')
      .argument('<threadId>', 'Thread ID')
      .action(async (threadId) => {
        try {
          await runAgentShell({ initialThreadId: threadId });
        } catch (error) {
          handleError(error);
        }
      })
  )
  .addCommand(
    new Command('archive')
      .description('Archive a thread')
      .argument('<threadId>', 'Thread ID')
      .action(async (threadId) => {
        try {
          await requireAuth();
          await archiveThreadAndPrint(threadId);
        } catch (error) {
          handleError(error);
        }
      })
  )
  .addCommand(
    new Command('respond')
      .description('Answer the latest pending input request on a thread')
      .argument('<threadId>', 'Thread ID')
      .argument('[answer]', 'Answer text (or use --stdin)')
      .option('--request <id>', 'Specific pending input request ID')
      .option('--stdin', 'Read the answer from stdin')
      .option('--json', 'Output as JSON')
      .option('--timeout <ms>', 'Wait timeout in milliseconds', Number.parseInt, 120000)
      .action(async (threadId, answer, options) => {
        try {
          await requireAuth();
          const stdinAnswer = options.stdin ? await readAnswerFromStdin() : '';
          const finalAnswer = (answer ?? stdinAnswer).trim();

          if (!finalAnswer) {
            throw new Error('Provide an answer argument or use --stdin.');
          }

          const result = await answerPendingInput(
            threadId,
            finalAnswer,
            options.request,
            options.timeout
          );

          if (options.json) {
            printJson(result);
            return;
          }

          print(formatHeader('Agent Response\n'));
          if (result.assistantMessage) {
            print(result.assistantMessage);
            print();
          }
          print(formatLabel('Thread', result.threadId));
          print(formatLabel('Status', result.status));
          if (result.pendingInputRequest) {
            print();
            print(formatHeader('Pending Input\n'));
            print(result.pendingInputRequest.title);
            print(result.pendingInputRequest.prompt);
          }
          if (result.error) {
            print(formatLabel('Error', result.error));
          }
        } catch (error) {
          handleError(error);
        }
      })
  );
