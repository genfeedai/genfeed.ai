import { createInterface } from 'node:readline/promises';
import chalk from 'chalk';
import { requireAuth } from '@/api/client';
import {
  type AgentPendingInputRequest,
  type AgentThreadEvent,
  archiveThread,
  getThread,
  getThreadSnapshot,
  listThreads,
  respondToInputRequest,
  startAgentChatStream,
} from '@/api/threads';
import {
  clearLastAgentThreadId,
  getLastAgentThreadId,
  getOrganizationId,
  setLastAgentThreadId,
} from '@/config/store';
import { type AgentRunCallbacks, type AgentRunResult, observeAgentRun } from '@/shell/agent-run';
import {
  type AssistantStreamRenderer,
  createAssistantStreamRenderer,
} from '@/shell/assistant-stream-renderer';
import {
  formatError,
  formatHeader,
  formatInfo,
  formatLabel,
  formatSuccess,
  formatWarning,
  print,
} from '@/ui/theme';
import { setReplMode } from '@/utils/errors';
import { extractString } from '@/utils/extract';

interface AgentShellOptions {
  initialThreadId?: string;
  model?: string;
}

interface AgentShellState {
  brandId?: string | null;
  contextVersion?: number;
  lastSequence: number;
  model?: string;
  pendingInputRequest: AgentPendingInputRequest | null;
  threadId?: string;
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
  const [thread, snapshot] = await Promise.all([getThread(threadId), getThreadSnapshot(threadId)]);
  state.brandId = thread.brandId;
  state.contextVersion = thread.contextVersion;
  state.threadId = threadId;
  state.lastSequence = snapshot.lastSequence ?? 0;
  state.pendingInputRequest = snapshot.pendingInputRequests.at(-1) ?? null;
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

function printPersistedRunEvent(event: AgentThreadEvent): void {
  const payload = event.payload ?? {};

  switch (event.type) {
    case 'tool.started': {
      const toolName = extractString(payload, 'toolName') ?? 'unknown_tool';
      print(chalk.dim(`\n[tool:start] ${toolName}`));
      return;
    }
    case 'tool.completed': {
      const toolName = extractString(payload, 'toolName') ?? 'unknown_tool';
      const status = extractString(payload, 'status') ?? 'completed';
      const error = extractString(payload, 'error');
      const suffix = error ? ` - ${error}` : '';
      print(chalk.dim(`[tool:${status}] ${toolName}${suffix}`));
      return;
    }
    default:
      return;
  }
}

function createShellRunCallbacks(
  state: AgentShellState,
  renderer: AssistantStreamRenderer
): AgentRunCallbacks {
  return {
    onAssistantDelta: (token) => renderer.onDelta(token),
    onAssistantFinalized: (content, _previousContent, metadata) => {
      renderer.onFinal(content);
      printUiActionSummary({ ...(metadata ?? {}), threadId: state.threadId });
    },
    onPersistedEvent: printPersistedRunEvent,
  };
}

function applyRunResult(state: AgentShellState, result: AgentRunResult): void {
  state.lastSequence = result.lastSequence;
  state.pendingInputRequest = result.pendingInputRequest ?? null;

  if (result.pendingInputRequest) {
    printPendingInputRequest(result.pendingInputRequest);
    return;
  }

  if (result.status === 'failed') {
    print(formatError(result.error ?? 'Agent run failed'));
    return;
  }

  if (result.status === 'timeout') {
    print(formatWarning('Run is still active. Use `gf threads show <threadId>` to inspect it.'));
    return;
  }

  print(chalk.dim('Run completed.'));
}

async function sendAgentTurn(state: AgentShellState, content: string): Promise<void> {
  const renderer = createAssistantStreamRenderer({
    prefix: `${chalk.green('\nAssistant:')} `,
  });
  let result: AgentRunResult;

  try {
    result = await observeAgentRun(
      async () =>
        await startAgentChatStream({
          brandId: state.brandId ?? null,
          content,
          expectedContextVersion: state.contextVersion,
          model: state.model,
          source: 'agent',
          threadId: state.threadId,
        }),
      (response) => (response.threadId === state.threadId ? state.lastSequence : 0),
      120_000,
      {
        ...createShellRunCallbacks(state, renderer),
        onRunStarted: async (response) => {
          const threadChanged = response.threadId !== state.threadId;
          state.threadId = response.threadId;
          state.brandId = response.brandId;
          state.contextVersion = response.contextVersion;
          state.pendingInputRequest = null;
          await setLastAgentThreadId(response.threadId, await getOrganizationId());

          if (threadChanged) {
            print(formatSuccess(`Active thread: ${response.threadId}`));
          } else {
            print(chalk.dim(`Continuing thread ${shortId(response.threadId)}`));
          }
        },
      }
    );
  } finally {
    renderer.finish();
  }

  if (result.assistantMessage && !renderer.hasRenderedContent()) {
    renderer.onFinal(result.assistantMessage);
  }
  applyRunResult(state, result);
}

async function submitPendingInput(state: AgentShellState, answer: string): Promise<void> {
  const request = state.pendingInputRequest;
  if (!state.threadId || !request) {
    return;
  }

  const renderer = createAssistantStreamRenderer({
    prefix: `${chalk.green('\nAssistant:')} `,
  });
  let result: AgentRunResult;

  try {
    result = await observeAgentRun(
      async () => {
        await respondToInputRequest(state.threadId!, request.requestId, answer, {
          brandId: state.brandId ?? null,
          expectedContextVersion: state.contextVersion,
        });
        state.pendingInputRequest = null;
        print(chalk.dim('Input submitted.'));
        return { threadId: state.threadId! };
      },
      state.lastSequence,
      120_000,
      createShellRunCallbacks(state, renderer)
    );
  } finally {
    renderer.finish();
  }

  if (result.assistantMessage && !renderer.hasRenderedContent()) {
    renderer.onFinal(result.assistantMessage);
  }
  applyRunResult(state, result);
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
      state.brandId = undefined;
      state.contextVersion = undefined;
      state.threadId = undefined;
      state.lastSequence = 0;
      state.pendingInputRequest = null;
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
      state.brandId = undefined;
      state.contextVersion = undefined;
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
