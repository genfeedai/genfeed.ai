import { Box, Text, useApp, useInput } from 'ink';
import { useEffect, useMemo, useRef, useState } from 'react';
import { generateArticle } from '@/api/articles';
import { requireAuth } from '@/api/client';
import { createImage } from '@/api/images';
import { type AgentPendingInputRequest, listThreads } from '@/api/threads';
import { createVideo } from '@/api/videos';
import { listWorkflowExecutions, listWorkflows } from '@/api/workflows';
import {
  clearActiveBrand,
  clearApiKey,
  clearLastAgentThreadId,
  getActiveBrand,
  getActiveProfile,
  getLastAgentThreadId,
  getOrganizationId,
  setLastAgentThreadId,
} from '@/config/store';
import { readAssets } from '@/operations/assets';
import { activateBrand, readBrands } from '@/operations/brands';
import {
  parseCreditQuantity,
  readCreditBalance,
  readCreditPacks,
  startCreditsCheckout,
} from '@/operations/credits';
import { runWorkflow } from '@/operations/workflows';
import { answerPendingInput, runAgentTurn } from '@/shell/agent-run';
import { openExternalUrl } from '@/utils/browser';
import { parseSlashCommand } from './slash-command';

export type WorkspaceExitAction = 'exit' | 'login' | 'signup';

interface WorkspaceProps {
  onDone: (action: WorkspaceExitAction) => void;
}

interface WorkspaceMessage {
  id: number;
  role: 'assistant' | 'error' | 'system' | 'user';
  text: string;
}

const HELP = [
  '/login, /signup, /logout',
  '/new, /resume <thread>, /threads',
  '/balance, /credits, /credits buy <amount>',
  '/brand, /brand use <id|slug|label>',
  '/workflows, /workflow run <id|key|label>',
  '/image <prompt>, /video <prompt>, /article <prompt>',
  '/assets, /jobs, /clear, /exit',
].join('\n');

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function messageColor(role: WorkspaceMessage['role']): string | undefined {
  if (role === 'assistant') return 'green';
  if (role === 'error') return 'red';
  if (role === 'system') return 'cyan';
  return undefined;
}

export function TerminalWorkspace({ onDone }: WorkspaceProps) {
  const { exit } = useApp();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<WorkspaceMessage[]>([
    { id: 1, role: 'system', text: 'Type a request, or /help for workspace commands.' },
  ]);
  const nextId = useRef(2);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [profileLabel, setProfileLabel] = useState('loading');
  const [brandLabel, setBrandLabel] = useState('none');
  const [threadId, setThreadId] = useState<string>();
  const [pendingInput, setPendingInput] = useState<AgentPendingInputRequest>();

  const shownMessages = useMemo(() => messages.slice(-24), [messages]);

  function append(role: WorkspaceMessage['role'], text: string): number {
    const id = nextId.current;
    nextId.current += 1;
    setMessages((items) => [...items, { id, role, text }]);
    return id;
  }

  function replaceMessage(id: number, text: string): void {
    setMessages((items) =>
      items.map((message) => (message.id === id ? { ...message, text } : message))
    );
  }

  async function refreshContext(): Promise<void> {
    const { name, profile } = await getActiveProfile();
    setProfileLabel(profile.apiKey ? name : `${name} (signed out)`);
    const activeBrand = await getActiveBrand();
    if (!activeBrand) {
      setBrandLabel('none');
      return;
    }
    const brands = await readBrands().catch(() => []);
    setBrandLabel(brands.find((brand) => brand.id === activeBrand)?.label ?? activeBrand);
  }

  useEffect(() => {
    const initialize = async () => {
      const [{ name, profile }, persistedThreadId] = await Promise.all([
        getActiveProfile(),
        getLastAgentThreadId(),
      ]);
      setProfileLabel(profile.apiKey ? name : `${name} (signed out)`);
      setThreadId(persistedThreadId);
      if (profile.activeBrand) {
        const brands = await readBrands().catch(() => []);
        setBrandLabel(
          brands.find((brand) => brand.id === profile.activeBrand)?.label ?? profile.activeBrand
        );
      }
    };

    void initialize().catch((error) => {
      const id = nextId.current;
      nextId.current += 1;
      setMessages((items) => [...items, { id, role: 'error', text: stringifyError(error) }]);
    });
  }, []);

  function finish(action: WorkspaceExitAction): void {
    onDone(action);
    exit();
  }

  async function runGeneration(kind: 'article' | 'image' | 'video', prompt: string): Promise<void> {
    if (!prompt) throw new Error(`Usage: /${kind} <prompt>`);
    await requireAuth();
    const { profile } = await getActiveProfile();
    const brandId = profile.activeBrand;
    if (!brandId) throw new Error('Select a brand first with /brand use <brand>');

    if (kind === 'image') {
      const result = await createImage({
        brandId,
        model: profile.defaults.imageModel,
        text: prompt,
      });
      append('system', `Image job ${result.id} — ${result.status}`);
      return;
    }
    if (kind === 'video') {
      const result = await createVideo({
        brandId,
        model: profile.defaults.videoModel,
        text: prompt,
      });
      append('system', `Video job ${result.id} — ${result.status}`);
      return;
    }
    const result = await generateArticle({ brandId, prompt, type: 'standard' });
    append('system', `Created ${result.length} article${result.length === 1 ? '' : 's'}.`);
  }

  async function handleSlashCommand(value: string): Promise<void> {
    const { args, name } = parseSlashCommand(value);
    switch (name) {
      case 'exit':
      case 'quit':
        finish('exit');
        return;
      case 'login':
        finish('login');
        return;
      case 'signup':
        finish('signup');
        return;
      case 'help':
        append('system', HELP);
        return;
      case 'clear':
        setMessages([]);
        return;
      case 'logout':
        await clearApiKey();
        await clearActiveBrand();
        setThreadId(undefined);
        setPendingInput(undefined);
        await refreshContext();
        append('system', 'Signed out. Use /login or /signup to continue.');
        return;
      case 'new':
        setThreadId(undefined);
        setPendingInput(undefined);
        await clearLastAgentThreadId(await getOrganizationId());
        append('system', 'The next message will start a new thread.');
        return;
      case 'resume':
        if (!args[0]) throw new Error('Usage: /resume <thread-id>');
        setThreadId(args[0]);
        setPendingInput(undefined);
        await setLastAgentThreadId(args[0], await getOrganizationId());
        append('system', `Resumed thread ${args[0]}.`);
        return;
      case 'threads': {
        await requireAuth();
        const threads = await listThreads();
        append(
          'system',
          threads.length
            ? threads
                .slice(0, 10)
                .map(
                  (thread) => `${thread.id}  ${thread.title ?? 'Untitled'}  ${thread.status ?? ''}`
                )
                .join('\n')
            : 'No threads found.'
        );
        return;
      }
      case 'balance': {
        await requireAuth();
        const balance = await readCreditBalance();
        append('system', `${balance.balance.toLocaleString()} credits available.`);
        return;
      }
      case 'credits': {
        await requireAuth();
        if (args[0] === 'buy') {
          if (!args[1]) throw new Error('Usage: /credits buy <credits>');
          const checkout = await startCreditsCheckout(parseCreditQuantity(args[1]));
          const opened = await openExternalUrl(checkout.url);
          append('system', `${opened ? 'Opened' : 'Created'} secure checkout: ${checkout.url}`);
          return;
        }
        const packs = readCreditPacks();
        append(
          'system',
          packs.packs
            .map((pack) => `${pack.credits.toLocaleString()} credits — $${pack.usd}`)
            .join('\n')
        );
        return;
      }
      case 'brand': {
        await requireAuth();
        if (args[0] === 'use') {
          const reference = args.slice(1).join(' ');
          if (!reference) throw new Error('Usage: /brand use <id|slug|label>');
          const brand = await activateBrand(reference);
          setBrandLabel(brand.label);
          append('system', `Active brand: ${brand.label}`);
          return;
        }
        const brands = await readBrands();
        append(
          'system',
          brands
            .map((brand) => `${brand.id}  ${brand.label}${brand.slug ? `  (${brand.slug})` : ''}`)
            .join('\n') || 'No brands found.'
        );
        return;
      }
      case 'workflows': {
        await requireAuth();
        const workflows = await listWorkflows();
        append(
          'system',
          workflows
            .map((workflow) => `${workflow.id}  ${workflow.label ?? workflow.key ?? ''}`)
            .join('\n') || 'No workflows found.'
        );
        return;
      }
      case 'workflow': {
        await requireAuth();
        if (args[0] !== 'run' || !args[1]) {
          throw new Error('Usage: /workflow run <id|key|label>');
        }
        const result = await runWorkflow(args.slice(1).join(' '));
        append(
          'system',
          `Started ${result.workflow.label ?? result.workflow.id}: ${result.execution.id}`
        );
        return;
      }
      case 'assets': {
        await requireAuth();
        const assets = await readAssets({ limit: 10 });
        append(
          'system',
          assets
            .map((asset) => `${asset.id}  ${asset.category ?? ''}  ${asset.status ?? ''}`)
            .join('\n') || 'No assets found.'
        );
        return;
      }
      case 'jobs': {
        await requireAuth();
        const jobs = await listWorkflowExecutions({ limit: 10 });
        append(
          'system',
          jobs
            .map(
              (job) =>
                `${job.id}  ${job.workflow?.label ?? job.workflowId ?? ''}  ${job.status ?? ''}`
            )
            .join('\n') || 'No recent workflow jobs found.'
        );
        return;
      }
      case 'image':
      case 'video':
      case 'article':
        await runGeneration(name, args.join(' '));
        return;
      default:
        throw new Error(`Unknown command /${name}. Use /help.`);
    }
  }

  async function sendMessage(content: string): Promise<void> {
    await requireAuth();
    const assistantMessageId = append('assistant', '…');
    let streamed = '';
    const result =
      pendingInput && threadId
        ? await answerPendingInput(threadId, content, pendingInput.requestId, 120_000, {
            onAssistantDelta: (token) => {
              streamed += token;
              replaceMessage(assistantMessageId, streamed);
            },
          })
        : await runAgentTurn({ content, source: 'agent', threadId }, 120_000, {
            onAssistantDelta: (token) => {
              streamed += token;
              replaceMessage(assistantMessageId, streamed);
            },
            onRunStarted: async (run) => {
              setThreadId(run.threadId);
              await setLastAgentThreadId(run.threadId, await getOrganizationId());
            },
          });
    setPendingInput(result.pendingInputRequest);
    if (!streamed) {
      replaceMessage(assistantMessageId, result.assistantMessage ?? result.error ?? result.status);
    }
  }

  async function submit(value: string): Promise<void> {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    setInput('');
    setHistory((items) => [...items, trimmed]);
    setHistoryIndex(-1);
    append('user', trimmed);
    setBusy(true);
    try {
      if (trimmed.startsWith('/')) await handleSlashCommand(trimmed);
      else await sendMessage(trimmed);
    } catch (error) {
      append('error', stringifyError(error));
    } finally {
      setBusy(false);
    }
  }

  useInput((character, key) => {
    if (key.ctrl && character === 'c') return finish('exit');
    if (busy) return;
    if (key.return) return void submit(input);
    if (key.backspace || key.delete) return setInput((value) => value.slice(0, -1));
    if (key.upArrow && history.length > 0) {
      const index = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(index);
      setInput(history[history.length - 1 - index] ?? '');
      return;
    }
    if (key.downArrow) {
      const index = historyIndex - 1;
      setHistoryIndex(index);
      setInput(index < 0 ? '' : (history[history.length - 1 - index] ?? ''));
      return;
    }
    if (character && !key.ctrl && !key.meta) setInput((value) => value + character);
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="#7C3AED">
        GF · Genfeed terminal content workspace
      </Text>
      <Text dimColor>
        profile:{profileLabel} · brand:{brandLabel} · thread:{threadId?.slice(0, 10) ?? 'new'}
      </Text>
      <Text dimColor>{'─'.repeat(72)}</Text>
      {shownMessages.map((message) => (
        <Box key={message.id} marginBottom={1}>
          <Text bold color={messageColor(message.role)}>
            {message.role === 'user' ? 'you' : message.role === 'assistant' ? 'gf' : message.role}
            {': '}
          </Text>
          <Text color={messageColor(message.role)}>{message.text}</Text>
        </Box>
      ))}
      {pendingInput ? <Text color="yellow">Input requested: {pendingInput.prompt}</Text> : null}
      <Text>
        <Text color="#7C3AED">{busy ? '…' : '›'}</Text> {input}
        {!busy ? <Text inverse> </Text> : null}
      </Text>
    </Box>
  );
}
