import { createInterface } from 'node:readline/promises';
import chalk from 'chalk';
import { requireAuth } from '@/api/client.js';
import {
  type AgentPendingInputRequest,
  type AgentThreadEvent,
  archiveThread,
  getThread,
  getThreadEvents,
  getThreadSnapshot,
  listThreads,
  respondToInputRequest,
  startAgentChatStream,
} from '@/api/threads.js';
import {
  clearLastAgentThreadId,
  getLastAgentThreadId,
  getOrganizationId,
  setLastAgentThreadId,
} from '@/config/store.js';
import {
  formatError,
  formatHeader,
  formatInfo,
  formatLabel,
  formatSuccess,
  formatWarning,
  print,
} from '@/ui/theme.js';
import { setReplMode } from '@/utils/errors.js';

interface AgentShellOptions {
  initialThreadId?: string;
  model?: string;
}

interface AgentShellState {
  isStreamingAssistant: boolean;
  lastSequence: number;
  model?: string;
  pendingInputRequest: AgentPendingInputRequest | null;
  threadId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function shortId(value?: string): string {
  if (!value) return 'new';
  return value.length > 10 ? value.slice(0, 10) : value;
}

function shellPrompt(state: AgentShellState): string {
  const mode = state.pendingInputRequest ? 'input' : 'chat';
  const threadLabel = state.threadId ? `thread:${shortId(state.threadId)}` : 'thread:new';
  return chalk.hex('#7C3AED')('gf') + chalk.dim(` [${threadLabel} | ${mode}] > `);
}

function printShellHelp(): void {
  print(formatHeader('Agent Shell\n'));
  print('  /new                 Start the next turn in a new thread');
  print('  /resume <threadId>   Switch the shell to an existing thread');
  print('  /threads             List recent threads');
  print('  /help                Show shell help');
  print('  /exit                Exit the shell');
  print();
  print(chalk.dim('Type a normal message to talk to the agent.'));
}

function printUiActionSummary(metadata?: Record<string, unknown>): void {
  const uiActions = Array.isArray(metadata?.uiActions)
    ? (metadata.uiActions as Array<Record<string, unknown>>)
    : [];

  if (uiActions.length === 0) {
    return;
  }

  print();
  print(formatHeader('UI Actions\n'));

  for (const action of uiActions) {
    const type = typeof action.type === 'string' ? action.type : 'ui-action';
    const title = typeof action.title === 'string' ? action.title : type;
    print(`  ${chalk.cyan(title)} ${chalk.dim(`(${type})`)}`);

    if (typeof action.description === 'string' && action.description.trim()) {
      print(`  ${chalk.dim(action.description)}`);
    }

    if (typeof action.workflowId === 'string') {
      print(`  ${chalk.dim(`Try: gf workflow show ${action.workflowId}`)}`);
    } else if (typeof action.botId === 'string') {
      print(`  ${chalk.dim(`Try: gf chat --thread ${metadata?.threadId ?? ''}`.trim())}`);
    } else if (type === 'credits_balance_card') {
      print(`  ${chalk.dim('Try: gf credits summary')}`);
    }
  }
}

function printPendingInputRequest(request: AgentPendingInputRequest): void {
  print();
  print(formatHeader(`${request.title}\n`));
  print(request.prompt);

  if (request.options?.length) {
    print();
    for (const option of request.options) {
      const recommended =
        option.id === request.recommendedOptionId ? chalk.dim(' (recommended)') : '';
      print(`  ${chalk.cyan(option.id)} ${option.label}${recommended}`);
      if (option.description) {
        print(`  ${chalk.dim(option.description)}`);
      }
    }
  }

  print();
  print(chalk.dim('Reply with one of the option ids or free text to continue.'));
}

async function listThreadsInline(): Promise<void> {
  const threads = await listThreads();

  if (threads.length === 0) {
    print(chalk.dim('No threads found.'));
    return;
  }

  print();
  print(formatHeader('Threads\n'));
  for (const thread of threads.slice(0, 10)) {
    const title = thread.title || thread.lastAssistantPreview || 'Untitled thread';
    const status = thread.status ? chalk.dim(` (${thread.status})`) : '';
    print(`  ${chalk.cyan(title)}${status}`);
    print(`  ${chalk.dim(thread.id)}`);
    if (thread.lastAssistantPreview) {
      print(`  ${chalk.dim(thread.lastAssistantPreview)}`);
    }
    print(`  ${chalk.dim(`Resume: gf chat --thread ${thread.id}`)}`);
    print();
  }
}

async function attachThread(
  state: AgentShellState,
  threadId: string,
  contextLabel: string
): Promise<void> {
  const snapshot = await getThreadSnapshot(threadId);
  state.threadId = threadId;
  state.lastSequence = snapshot.lastSequence ?? 0;
  state.pendingInputRequest = snapshot.pendingInputRequests.at(-1) ?? null;
  state.isStreamingAssistant = false;
  await setLastAgentThreadId(threadId, await getOrganizationId());

  print(formatInfo(`${contextLabel}: ${threadId}`));

  if (snapshot.title) {
    print(formatLabel('Title', snapshot.title));
  }

  if (state.pendingInputRequest) {
    printPendingInputRequest(state.pendingInputRequest);
  } else if (snapshot.lastAssistantMessage?.content) {
    print(
      chalk.dim(`Last assistant message: ${snapshot.lastAssistantMessage.content.slice(0, 120)}`)
    );
  }
}

function extractString(
  record: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
}

async function handleThreadEvent(
  state: AgentShellState,
  event: AgentThreadEvent
): Promise<'continue' | 'done' | 'waiting-input'> {
  const payload = event.payload ?? {};

  switch (event.type) {
    case 'assistant.delta': {
      const token = extractString(payload, 'content');
      if (!token) return 'continue';
      if (!state.isStreamingAssistant) {
        process.stdout.write(`${chalk.green('\nAssistant:')} `);
        state.isStreamingAssistant = true;
      }
      process.stdout.write(token);
      return 'continue';
    }
    case 'assistant.finalized': {
      const content = extractString(payload, 'content') ?? '';
      if (state.isStreamingAssistant) {
        process.stdout.write('\n');
        state.isStreamingAssistant = false;
      } else if (content) {
        print(`${chalk.green('\nAssistant:')} ${content}`);
      }
      printUiActionSummary({
        ...(isRecord(payload.metadata) ? payload.metadata : {}),
        threadId: state.threadId,
      });
      return 'continue';
    }
    case 'tool.started': {
      const toolName = extractString(payload, 'toolName') ?? 'unknown_tool';
      print(chalk.dim(`\n[tool:start] ${toolName}`));
      return 'continue';
    }
    case 'tool.completed': {
      const toolName = extractString(payload, 'toolName') ?? 'unknown_tool';
      const status = extractString(payload, 'status') ?? 'completed';
      const error = extractString(payload, 'error');
      const suffix = error ? ` - ${error}` : '';
      print(chalk.dim(`[tool:${status}] ${toolName}${suffix}`));
      return 'continue';
    }
    case 'input.requested': {
      if (state.isStreamingAssistant) {
        process.stdout.write('\n');
        state.isStreamingAssistant = false;
      }
      const request: AgentPendingInputRequest = {
        allowFreeText:
          typeof payload.allowFreeText === 'boolean' ? payload.allowFreeText : undefined,
        fieldId: extractString(payload, 'fieldId'),
        metadata: isRecord(payload.metadata) ? payload.metadata : undefined,
        options: Array.isArray(payload.options)
          ? (payload.options as AgentPendingInputRequest['options'])
          : undefined,
        prompt: extractString(payload, 'prompt') ?? 'Provide the requested input.',
        recommendedOptionId: extractString(payload, 'recommendedOptionId'),
        requestId: extractString(payload, 'requestId') ?? '',
        title: extractString(payload, 'title') ?? 'Input requested',
      };
      state.pendingInputRequest = request;
      printPendingInputRequest(request);
      return 'waiting-input';
    }
    case 'run.completed': {
      if (state.isStreamingAssistant) {
        process.stdout.write('\n');
        state.isStreamingAssistant = false;
      }
      state.pendingInputRequest = null;
      print(chalk.dim('Run completed.'));
      return 'done';
    }
    case 'run.failed':
    case 'error.raised': {
      if (state.isStreamingAssistant) {
        process.stdout.write('\n');
        state.isStreamingAssistant = false;
      }
      state.pendingInputRequest = null;
      print(formatError(extractString(payload, 'error') ?? 'Agent run failed'));
      return 'done';
    }
    default:
      return 'continue';
  }
}

async function tailThreadRun(state: AgentShellState): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 120_000) {
    const events = await getThreadEvents(state.threadId!, state.lastSequence);

    if (events.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    }

    for (const event of events) {
      state.lastSequence = Math.max(state.lastSequence, event.sequence);
      const outcome = await handleThreadEvent(state, event);
      if (outcome === 'done' || outcome === 'waiting-input') {
        return;
      }
    }
  }

  print(formatWarning('Run is still active. Use `gf threads show <threadId>` to inspect it.'));
}

async function sendAgentTurn(state: AgentShellState, content: string): Promise<void> {
  const response = await startAgentChatStream({
    content,
    model: state.model,
    source: 'agent',
    threadId: state.threadId,
  });
  const threadChanged = response.threadId !== state.threadId;
  state.threadId = response.threadId;
  state.pendingInputRequest = null;
  state.isStreamingAssistant = false;
  await setLastAgentThreadId(response.threadId, await getOrganizationId());

  if (threadChanged) {
    print(formatSuccess(`Active thread: ${response.threadId}`));
  } else {
    print(chalk.dim(`Continuing thread ${shortId(response.threadId)}`));
  }

  await tailThreadRun(state);
}

async function submitPendingInput(state: AgentShellState, answer: string): Promise<void> {
  const request = state.pendingInputRequest;
  if (!state.threadId || !request) {
    return;
  }

  await respondToInputRequest(state.threadId, request.requestId, answer);
  state.pendingInputRequest = null;
  print(chalk.dim('Input submitted.'));
  await tailThreadRun(state);
}

async function handleSlashCommand(state: AgentShellState, input: string): Promise<boolean> {
  const [command, ...args] = input.slice(1).trim().split(/\s+/);

  switch (command) {
    case 'exit':
    case 'quit':
      return false;
    case 'help':
      printShellHelp();
      return true;
    case 'threads':
      await listThreadsInline();
      return true;
    case 'new':
      state.threadId = undefined;
      state.lastSequence = 0;
      state.pendingInputRequest = null;
      state.isStreamingAssistant = false;
      await clearLastAgentThreadId(await getOrganizationId());
      print(formatInfo('Next message will start a new thread.'));
      return true;
    case 'resume': {
      const threadId = args[0];
      if (!threadId) {
        print(formatError('Usage: /resume <threadId>'));
        return true;
      }
      await attachThread(state, threadId, 'Resumed thread');
      return true;
    }
    default:
      print(formatError(`Unknown slash command: /${command}`));
      print(chalk.dim('Run /help to see available commands.'));
      return true;
  }
}

export async function runAgentShell(options: AgentShellOptions = {}): Promise<void> {
  await requireAuth();
  setReplMode(true);

  const state: AgentShellState = {
    isStreamingAssistant: false,
    lastSequence: 0,
    model: options.model,
    pendingInputRequest: null,
    threadId: options.initialThreadId,
  };

  const persistedThreadId =
    options.initialThreadId ?? (await getLastAgentThreadId(await getOrganizationId()));

  printShellHelp();
  print();

  if (state.model) {
    print(formatInfo(`Using agent model: ${state.model}`));
    print();
  }

  if (persistedThreadId) {
    try {
      await attachThread(state, persistedThreadId, 'Resuming thread');
    } catch (error) {
      print(formatWarning(`Could not restore thread ${persistedThreadId}: ${String(error)}`));
      state.threadId = undefined;
      state.lastSequence = 0;
      state.pendingInputRequest = null;
    }
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    while (true) {
      const line = await rl.question(shellPrompt(state));
      const trimmed = line.trim();

      if (!trimmed) {
        continue;
      }

      if (trimmed.startsWith('/')) {
        const shouldContinue = await handleSlashCommand(state, trimmed);
        if (!shouldContinue) {
          break;
        }
        continue;
      }

      if (state.pendingInputRequest) {
        await submitPendingInput(state, trimmed);
        continue;
      }

      await sendAgentTurn(state, trimmed);
    }
  } finally {
    rl.close();
    setReplMode(false);
    print(chalk.dim('Goodbye!'));
  }
}

export async function showThreadSummary(threadId: string): Promise<void> {
  const [thread, snapshot] = await Promise.all([getThread(threadId), getThreadSnapshot(threadId)]);

  print(formatHeader('Thread\n'));
  print(formatLabel('ID', thread.id));
  print(formatLabel('Status', thread.status ?? 'unknown'));
  print(formatLabel('Source', thread.source ?? 'unknown'));
  print(formatLabel('Run status', thread.runStatus ?? 'idle'));
  if (thread.title) {
    print(formatLabel('Title', thread.title));
  }
  if (thread.lastActivityAt) {
    print(formatLabel('Last activity', new Date(thread.lastActivityAt).toLocaleString()));
  }
  if (snapshot.lastAssistantMessage?.content) {
    print();
    print(formatHeader('Last Assistant Message\n'));
    print(snapshot.lastAssistantMessage.content);
  }
  if (snapshot.pendingInputRequests.length > 0) {
    print();
    print(formatHeader('Pending Input\n'));
    printPendingInputRequest(snapshot.pendingInputRequests.at(-1)!);
  }
}

export async function archiveThreadAndPrint(threadId: string): Promise<void> {
  const archived = await archiveThread(threadId);
  if ((await getLastAgentThreadId(await getOrganizationId())) === threadId) {
    await clearLastAgentThreadId(await getOrganizationId());
  }
  print(formatSuccess(`Archived thread ${archived.id}`));
}
