import { Command } from 'commander';
import type { AgentChatAttachment } from '@/api/threads.js';
import { getActiveProfile } from '@/config/store.js';
import { runAgentTurn } from '@/shell/agent-run.js';
import { runAgentShell } from '@/shell/agent-shell.js';
import { formatHeader, print, printJson } from '@/ui/theme.js';
import { handleError } from '@/utils/errors.js';

async function readPromptFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8').trim();
}

function collectAttachment(value: string, previous: string[] = []): string[] {
  previous.push(value);
  return previous;
}

function parseAttachments(values?: string[]): AgentChatAttachment[] | undefined {
  if (!values?.length) {
    return undefined;
  }

  return values.map((value) => JSON.parse(value) as AgentChatAttachment);
}

export const chatCommand = new Command('chat')
  .description('Start the interactive agent shell')
  .option('-t, --thread <id>', 'Resume an existing thread')
  .option('-m, --model <model>', 'Override the default agent model for this shell')
  .action(async (options) => {
    try {
      const { profile } = await getActiveProfile();
      await runAgentShell({
        initialThreadId: options.thread,
        model: options.model ?? profile.agent.model,
      });
    } catch (error) {
      handleError(error);
    }
  });

chatCommand.addCommand(
  new Command('send')
    .description('Send one message to the Genfeed agent and wait for the result')
    .argument('[prompt]', 'Message content (or use --stdin)')
    .option('-t, --thread <id>', 'Continue an existing thread')
    .option('-m, --model <model>', 'Override the default agent model')
    .option(
      '-a, --attachment <json>',
      'Attachment JSON ({ "url": "...", "ingredientId": "...", "kind": "...", "name": "..." })',
      collectAttachment,
      []
    )
    .option('--stdin', 'Read the prompt from stdin')
    .option('--json', 'Output as JSON')
    .option('--timeout <ms>', 'Wait timeout in milliseconds', Number.parseInt, 120000)
    .action(async (prompt, options) => {
      try {
        const stdinPrompt = options.stdin ? await readPromptFromStdin() : '';
        const content = (prompt ?? stdinPrompt).trim();

        if (!content) {
          throw new Error('Provide a prompt argument or use --stdin.');
        }

        const { profile } = await getActiveProfile();
        const result = await runAgentTurn(
          {
            attachments: parseAttachments(options.attachment),
            content,
            model: options.model ?? profile.agent.model,
            source: 'agent',
            threadId: options.thread,
          },
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
        print(`Thread: ${result.threadId}`);
        print(`Status: ${result.status}`);
        if (result.pendingInputRequest) {
          print();
          print(formatHeader('Pending Input\n'));
          print(result.pendingInputRequest.title);
          print(result.pendingInputRequest.prompt);
        }
        if (result.error) {
          print(`Error: ${result.error}`);
        }
      } catch (error) {
        handleError(error);
      }
    })
);
