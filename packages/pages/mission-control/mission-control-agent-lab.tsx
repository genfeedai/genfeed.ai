'use client';

import { AgentChatInput } from '@genfeedai/agent/components/AgentChatInput';
import { AgentChatMessage } from '@genfeedai/agent/components/AgentChatMessage';
import type {
  AgentChatMessage as AgentChatMessageModel,
  AgentToolCall,
} from '@genfeedai/agent/models/agent-chat.model';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import type { TableColumn } from '@props/ui/display/table.props';
import LowCreditsBanner from '@ui/banners/low-credits/LowCreditsBanner';
import Button from '@ui/buttons/base/Button';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { Input } from '@ui/primitives/input';
import PromptBarSurfaceRenderer from '@ui/prompt-bars/surface/PromptBarSurfaceRenderer';
import { MISSION_CONTROL_PROMPT_BAR_SURFACE } from '@ui/prompt-bars/surface/prompt-bar-surface.config';
import Link from 'next/link';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  HiOutlineBeaker,
  HiOutlineBolt,
  HiOutlineChatBubbleBottomCenterText,
  HiOutlineCommandLine,
  HiOutlineFunnel,
  HiOutlineMagnifyingGlass,
  HiOutlineRectangleStack,
  HiOutlineSparkles,
  HiOutlineTableCells,
  HiOutlineXMark,
} from 'react-icons/hi2';

type AgentLabMode = 'overlay' | 'rail';
type AgentLabStatus =
  | 'blocked'
  | 'drafting'
  | 'needs-review'
  | 'ready'
  | 'scheduled';
type AgentLabPriority = 'high' | 'low' | 'medium';
type AgentLabContextKind = 'bulk' | 'page' | 'row';

interface MissionControlRow {
  id: string;
  asset: string;
  channel: 'Instagram' | 'LinkedIn' | 'TikTok' | 'X' | 'YouTube';
  owner: string;
  status: AgentLabStatus;
  priority: AgentLabPriority;
  trendScore: number;
  queueDepth: number;
  updatedAt: string;
}

interface AgentLabContext {
  badges: string[];
  kind: AgentLabContextKind;
  prompt: string;
  scopeSummary: string;
  title: string;
}

const STATUS_OPTIONS: Array<{ label: string; value: AgentLabStatus | 'all' }> =
  [
    { label: 'All statuses', value: 'all' },
    { label: 'Needs review', value: 'needs-review' },
    { label: 'Drafting', value: 'drafting' },
    { label: 'Ready', value: 'ready' },
    { label: 'Scheduled', value: 'scheduled' },
    { label: 'Blocked', value: 'blocked' },
  ];

const OWNERS = ['Ari', 'Mina', 'Jules', 'Theo', 'Sam'];
const CHANNELS: MissionControlRow['channel'][] = [
  'Instagram',
  'LinkedIn',
  'TikTok',
  'X',
  'YouTube',
];
const PRIORITIES: AgentLabPriority[] = ['high', 'medium', 'low'];
const STATUSES: AgentLabStatus[] = [
  'needs-review',
  'drafting',
  'ready',
  'scheduled',
  'blocked',
];
const ASSET_PREFIXES = [
  'Founder clip',
  'Trend reaction',
  'Case study reel',
  'Product teaser',
  'Customer proof',
  'Launch cutdown',
  'FAQ breakdown',
  'Behind the scenes',
];

function buildRows(): MissionControlRow[] {
  return Array.from({ length: 72 }, (_, index) => {
    const channel = CHANNELS[index % CHANNELS.length];
    const priority = PRIORITIES[index % PRIORITIES.length];
    const status = STATUSES[index % STATUSES.length];
    const trendScore = 54 + ((index * 7) % 43);
    const queueDepth = (index * 3) % 18;
    const day = ((index * 2) % 27) + 1;

    return {
      asset: `${ASSET_PREFIXES[index % ASSET_PREFIXES.length]} ${index + 1}`,
      channel,
      id: `lab-row-${index + 1}`,
      owner: OWNERS[index % OWNERS.length],
      priority,
      queueDepth,
      status,
      trendScore,
      updatedAt: `2026-03-${String(day).padStart(2, '0')} 14:${String(
        (index * 5) % 60,
      ).padStart(2, '0')}`,
    };
  });
}

const ROWS = buildRows();

function createToolCall(
  context: AgentLabContext,
  rowCount: number,
  prompt: string,
): AgentToolCall {
  return {
    arguments: {
      prompt,
      scope: context.kind,
      scopeSummary: context.scopeSummary,
    },
    id: `tool-${context.kind}-${rowCount}-${prompt.length}`,
    name: 'inspect_mission_control_scope',
    result: {
      candidateActions: [
        'Review top-risk assets',
        'Batch the highest-trend items',
        'Defer low-signal scheduled work',
      ],
      rowCount,
      summary: context.scopeSummary,
    },
    status: 'completed',
  };
}

function createUserMessage(
  content: string,
  threadId: string,
  index: number,
): AgentChatMessageModel {
  return {
    content,
    createdAt: `2026-03-12T09:${String(index).padStart(2, '0')}:00.000Z`,
    id: `user-${threadId}-${index}`,
    role: 'user',
    threadId,
  };
}

function createAssistantMessage(
  content: string,
  threadId: string,
  index: number,
  context: AgentLabContext,
): AgentChatMessageModel {
  return {
    content,
    createdAt: `2026-03-12T09:${String(index).padStart(2, '0')}:30.000Z`,
    id: `assistant-${threadId}-${index}`,
    metadata: {
      reasoning:
        'This lab uses seeded Mission Control data so the UI comparison stays stable while you assess the interaction model.',
      toolCalls: [createToolCall(context, context.badges.length, content)],
    },
    role: 'assistant',
    threadId,
  };
}

function buildSeededConversation(context: AgentLabContext): {
  messages: AgentChatMessageModel[];
  threadId: string;
} {
  const threadId = `lab-${context.kind}`;

  return {
    messages: [
      createAssistantMessage(
        `I can work inside Mission Control without leaving the table. I'll keep the conversation grounded in **${context.scopeSummary}** so you can judge whether this surface belongs in a rail or a wider overlay sheet.`,
        threadId,
        1,
        context,
      ),
      createUserMessage(context.prompt, threadId, 2),
      createAssistantMessage(
        `Initial pass:

- Prioritize the highest-trend items first.
- Keep low-signal rows out of review until the queue drops.
- Use the selected surface to decide whether this feels like a copilot or a task mode.`,
        threadId,
        3,
        context,
      ),
    ],
    threadId,
  };
}

function buildContextReply(
  input: string,
  context: AgentLabContext,
  visibleRows: MissionControlRow[],
): string {
  const prompt = input.trim().toLowerCase();
  const readyCount = visibleRows.filter((row) => row.status === 'ready').length;
  const blockedCount = visibleRows.filter(
    (row) => row.status === 'blocked',
  ).length;
  const topRows = visibleRows
    .slice()
    .sort((left, right) => right.trendScore - left.trendScore)
    .slice(0, 3)
    .map((row) => `${row.asset} (${row.trendScore})`)
    .join(', ');

  if (prompt.includes('review')) {
    return `For **${context.scopeSummary}**, I would send ${readyCount} ready assets into review first and keep ${blockedCount} blocked rows out of the queue. The key UX question is whether this feels cramped in the rail when I explain why.`;
  }

  if (prompt.includes('schedule')) {
    return `For **${context.scopeSummary}**, I would sequence the next publish window around the strongest three items: ${topRows}. This is the kind of response that usually benefits from the wider overlay because it mixes explanation with action recommendations.`;
  }

  return `Grounded in **${context.scopeSummary}**, the fastest move is to focus on the top-signal rows first: ${topRows}. Use this answer to judge whether the compact rail feels sufficient or whether the overlay sheet gives the agent enough operating room.`;
}

function buildPageContext(
  search: string,
  statusFilter: AgentLabStatus | 'all',
  visibleRows: MissionControlRow[],
  selectedRows: MissionControlRow[],
): AgentLabContext {
  const filterLabel = statusFilter === 'all' ? 'all statuses' : statusFilter;
  const searchLabel = search.trim() ? `"${search.trim()}"` : 'no search filter';

  return {
    badges: [
      `${visibleRows.length} visible rows`,
      filterLabel,
      selectedRows.length > 0
        ? `${selectedRows.length} selected`
        : 'no manual selection',
      searchLabel,
    ],
    kind: 'page',
    prompt: `Look at Mission Control and help me prioritize what should move next based on ${filterLabel} and ${searchLabel}.`,
    scopeSummary: `${visibleRows.length} visible rows filtered by ${filterLabel}`,
    title: 'Mission Control table context',
  };
}

function buildBulkContext(selectedRows: MissionControlRow[]): AgentLabContext {
  return {
    badges: [
      `${selectedRows.length} selected rows`,
      ...selectedRows.slice(0, 2).map((row) => row.channel),
    ],
    kind: 'bulk',
    prompt: `Compare the ${selectedRows.length} selected rows and tell me which ones should move first.`,
    scopeSummary: `${selectedRows.length} manually selected rows`,
    title: 'Selected rows',
  };
}

function buildRowContext(row: MissionControlRow): AgentLabContext {
  return {
    badges: [row.channel, row.status, `${row.trendScore} trend score`],
    kind: 'row',
    prompt: `Take a look at ${row.asset} and tell me what I should do next.`,
    scopeSummary: `${row.asset} on ${row.channel}`,
    title: row.asset,
  };
}

function StatusBadge({ status }: { status: AgentLabStatus }): ReactElement {
  const tone =
    status === 'ready'
      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
      : status === 'needs-review'
        ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
        : status === 'drafting'
          ? 'bg-blue-500/10 text-blue-300 border-blue-500/20'
          : status === 'scheduled'
            ? 'bg-violet-500/10 text-violet-300 border-violet-500/20'
            : 'bg-rose-500/10 text-rose-300 border-rose-500/20';

  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2 py-1 text-[11px] font-medium capitalize',
        tone,
      )}
    >
      {status.replace('-', ' ')}
    </span>
  );
}

function AgentLabSurface({
  context,
  messages,
  mode,
  onClose,
  onCopy,
  onSend,
  open,
}: {
  context: AgentLabContext | null;
  messages: AgentChatMessageModel[];
  mode: AgentLabMode;
  onClose: () => void;
  onCopy: (content: string) => void | Promise<void>;
  onSend: (content: string) => void;
  open: boolean;
}): ReactElement | null {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const viewport = scrollRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  }, [messages, open]);

  if (!open) {
    return null;
  }

  const shell = (
    <aside
      aria-label={
        mode === 'overlay'
          ? 'Agent overlay comparison surface'
          : 'Agent rail comparison surface'
      }
      data-mode={mode}
      data-testid="agent-lab-surface"
      className={cn(
        'relative flex h-full flex-col overflow-hidden border-l border-white/[0.08] bg-background/95 shadow-2xl backdrop-blur-xl',
        mode === 'overlay'
          ? 'w-full sm:w-[min(44rem,calc(100vw-3rem))]'
          : 'w-full sm:w-[24rem]',
      )}
    >
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
            {mode === 'overlay' ? 'Overlay Sheet' : 'Right Rail'}
          </p>
          <h2 className="mt-1 text-sm font-semibold text-foreground">
            {context?.title ?? 'Mission Control agent'}
          </h2>
        </div>
        <Button
          variant={ButtonVariant.GHOST}
          onClick={onClose}
          ariaLabel="Close agent lab surface"
          className="text-foreground/60 hover:text-foreground"
        >
          <HiOutlineXMark className="h-4 w-4" />
        </Button>
      </div>

      {context ? (
        <div className="border-b border-white/[0.08] px-4 py-3">
          <p className="text-sm text-foreground/80">{context.scopeSummary}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {context.badges.map((badge) => (
              <span
                key={badge}
                className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-foreground/55"
              >
                {badge}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 pb-44"
        data-testid="agent-lab-messages"
      >
        {messages.length === 0 ? (
          <div className="mx-auto mt-20 max-w-sm text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <HiOutlineSparkles className="h-6 w-6" />
            </div>
            <h3 className="mt-5 text-xl font-semibold text-foreground">
              Open the conversation from the page
            </h3>
            <p className="mt-2 text-sm text-foreground/60">
              Use the page, row, or bulk actions to seed the agent with context,
              then compare whether the rail or the overlay sheet feels better.
            </p>
          </div>
        ) : (
          messages.map((message, index) => (
            <AgentChatMessage
              key={message.id}
              message={message}
              messageIndex={index}
              onCopy={onCopy}
            />
          ))
        )}
      </div>

      <div className="relative shrink-0">
        <PromptBarSurfaceRenderer
          surface={MISSION_CONTROL_PROMPT_BAR_SURFACE}
          topContent={<LowCreditsBanner />}
        >
          <AgentChatInput
            onSend={onSend}
            placeholder="Ask about this Mission Control context..."
          />
        </PromptBarSurfaceRenderer>
      </div>
    </aside>
  );

  if (mode === 'overlay') {
    return (
      <div className="pointer-events-none fixed inset-0 z-40 top-16">
        <div
          className="pointer-events-auto absolute inset-0 bg-black/45"
          onClick={onClose}
        />
        <div className="pointer-events-auto absolute inset-y-0 right-0 flex justify-end">
          {shell}
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-y-0 right-0 z-30 top-16 hidden sm:block">
      <div className="pointer-events-auto h-full">{shell}</div>
    </div>
  );
}

export default function MissionControlAgentLabPage() {
  const [mode, setMode] = useState<AgentLabMode>('rail');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AgentLabStatus | 'all'>(
    'all',
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeContext, setActiveContext] = useState<AgentLabContext | null>(
    null,
  );
  const [messages, setMessages] = useState<AgentChatMessageModel[]>([]);
  const [activeThreadId, setActiveThreadId] = useState('lab-page');
  const [surfaceOpen, setSurfaceOpen] = useState(false);

  const visibleRows = useMemo(() => {
    return ROWS.filter((row) => {
      const matchesStatus =
        statusFilter === 'all' ? true : row.status === statusFilter;
      const query = search.trim().toLowerCase();
      const matchesSearch =
        query.length === 0
          ? true
          : [row.asset, row.channel, row.owner, row.status]
              .join(' ')
              .toLowerCase()
              .includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [search, statusFilter]);

  const selectedRows = useMemo(
    () => visibleRows.filter((row) => selectedIds.includes(row.id)),
    [selectedIds, visibleRows],
  );

  const stats = useMemo(() => {
    const needsReview = visibleRows.filter(
      (row) => row.status === 'needs-review',
    ).length;
    const averageTrend =
      visibleRows.reduce((total, row) => total + row.trendScore, 0) /
      Math.max(visibleRows.length, 1);

    return [
      {
        label: 'Visible Rows',
        value: formatCompactNumber(visibleRows.length),
      },
      {
        label: 'Needs Review',
        value: formatCompactNumber(needsReview),
      },
      {
        label: 'Average Trend',
        value: `${Math.round(averageTrend)}`,
      },
      {
        label: 'Selected',
        value: formatCompactNumber(selectedRows.length),
      },
    ];
  }, [selectedRows.length, visibleRows]);

  const openSeededConversation = useCallback((context: AgentLabContext) => {
    const seeded = buildSeededConversation(context);
    setActiveContext(context);
    setActiveThreadId(seeded.threadId);
    setMessages(seeded.messages);
    setSurfaceOpen(true);
  }, []);

  const handleSend = useCallback(
    (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) {
        return;
      }

      const context =
        activeContext ??
        buildPageContext(search, statusFilter, visibleRows, selectedRows);

      setActiveContext(context);
      setMessages((currentMessages) => {
        const nextIndex = currentMessages.length + 1;

        return [
          ...currentMessages,
          {
            content: trimmed,
            createdAt: new Date().toISOString(),
            id: `user-${activeThreadId}-${nextIndex}`,
            role: 'user',
            threadId: activeThreadId,
          },
          {
            content: buildContextReply(trimmed, context, visibleRows),
            createdAt: new Date().toISOString(),
            id: `assistant-${activeThreadId}-${nextIndex + 1}`,
            metadata: {
              toolCalls: [createToolCall(context, visibleRows.length, trimmed)],
            },
            role: 'assistant',
            threadId: activeThreadId,
          },
        ];
      });
      setSurfaceOpen(true);
    },
    [
      activeContext,
      activeThreadId,
      search,
      selectedRows,
      statusFilter,
      visibleRows,
    ],
  );

  const handleCopy = useCallback(async (content: string) => {
    if (!content.trim() || typeof navigator === 'undefined') {
      return;
    }

    try {
      await navigator.clipboard.writeText(content);
    } catch {
      // Ignore clipboard failures in the lab surface.
    }
  }, []);

  const columns = useMemo<TableColumn<MissionControlRow>[]>(
    () => [
      {
        header: 'Asset',
        key: 'asset',
        render: (row) => (
          <div>
            <div className="font-medium text-foreground">{row.asset}</div>
            <div className="text-xs text-foreground/45">{row.id}</div>
          </div>
        ),
      },
      {
        header: 'Channel',
        key: 'channel',
      },
      {
        header: 'Owner',
        key: 'owner',
      },
      {
        header: 'Status',
        key: 'status',
        render: (row) => <StatusBadge status={row.status} />,
      },
      {
        header: 'Priority',
        key: 'priority',
        render: (row) => (
          <span className="capitalize text-foreground/75">{row.priority}</span>
        ),
      },
      {
        className: 'text-right',
        header: 'Trend',
        key: 'trendScore',
        render: (row) => (
          <span className="font-medium text-foreground">{row.trendScore}</span>
        ),
      },
      {
        className: 'text-right',
        header: 'Queue',
        key: 'queueDepth',
        render: (row) => (
          <span className="text-foreground/70">{row.queueDepth}</span>
        ),
      },
      {
        header: 'Last Update',
        key: 'updatedAt',
      },
      {
        className: 'w-[150px]',
        header: 'Agent',
        key: 'agent',
        render: (row) => (
          <Button
            variant={ButtonVariant.SECONDARY}
            onClick={() => openSeededConversation(buildRowContext(row))}
            className="uppercase text-[11px] tracking-[0.12em]"
          >
            Ask Agent
          </Button>
        ),
      },
    ],
    [openSeededConversation],
  );

  return (
    <div
      className={cn(
        'transition-[padding-right] duration-300',
        mode === 'rail' && surfaceOpen && 'xl:pr-[24rem]',
      )}
    >
      <Container
        label="Agent UX Lab"
        description="Compare a compact right rail against a wider overlay sheet while staying inside Mission Control."
        icon={HiOutlineBeaker}
        right={
          <Link href="/chat/new">
            <Button variant={ButtonVariant.SECONDARY}>
              Open /chat Workspace
            </Button>
          </Link>
        }
      >
        <div className="space-y-6">
          <div className="rounded-2xl border border-primary/15 bg-primary/5 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">
                  Internal Prototype
                </p>
                <h2 className="mt-2 text-xl font-semibold text-foreground">
                  Test the conversation surface without leaving the SaaS UI
                </h2>
                <p className="mt-2 text-sm text-foreground/65">
                  The table, filters, and row selection persist while you switch
                  between a narrow right rail and a wider overlay sheet. The
                  agent conversation is seeded locally so the UX comparison
                  stays deterministic.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={
                    mode === 'rail'
                      ? ButtonVariant.DEFAULT
                      : ButtonVariant.SECONDARY
                  }
                  onClick={() => setMode('rail')}
                >
                  <span className="inline-flex items-center gap-2">
                    <HiOutlineRectangleStack className="h-4 w-4" />
                    Right Rail
                  </span>
                </Button>
                <Button
                  variant={
                    mode === 'overlay'
                      ? ButtonVariant.DEFAULT
                      : ButtonVariant.SECONDARY
                  }
                  onClick={() => setMode('overlay')}
                >
                  <span className="inline-flex items-center gap-2">
                    <HiOutlineTableCells className="h-4 w-4" />
                    Overlay Sheet
                  </span>
                </Button>
                <Button
                  variant={ButtonVariant.SECONDARY}
                  onClick={() =>
                    openSeededConversation(
                      buildPageContext(
                        search,
                        statusFilter,
                        visibleRows,
                        selectedRows,
                      ),
                    )
                  }
                >
                  <span className="inline-flex items-center gap-2">
                    <HiOutlineChatBubbleBottomCenterText className="h-4 w-4" />
                    Ask About This Table
                  </span>
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
                  {stat.label}
                </p>
                <p className="mt-3 text-2xl font-semibold text-foreground">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
                <label className="relative flex-1">
                  <HiOutlineMagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/35" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="w-full rounded-xl border border-white/[0.08] bg-background px-10 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-foreground/30 focus:border-primary/40"
                    placeholder="Search assets, channels, owners, or status"
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      variant={
                        statusFilter === option.value
                          ? ButtonVariant.DEFAULT
                          : ButtonVariant.SECONDARY
                      }
                      onClick={() => setStatusFilter(option.value)}
                    >
                      <span className="inline-flex items-center gap-2">
                        <HiOutlineFunnel className="h-4 w-4" />
                        {option.label}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant={ButtonVariant.SECONDARY}
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('all');
                    setSelectedIds([]);
                  }}
                >
                  Reset Filters
                </Button>
                <Button
                  variant={ButtonVariant.SECONDARY}
                  onClick={() => {
                    setActiveContext(null);
                    setMessages([]);
                    setSurfaceOpen(true);
                  }}
                >
                  <span className="inline-flex items-center gap-2">
                    <HiOutlineCommandLine className="h-4 w-4" />
                    Open Empty Surface
                  </span>
                </Button>
              </div>
            </div>
          </div>

          {selectedRows.length > 0 ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/8 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {selectedRows.length} rows selected for comparison
                </p>
                <p className="mt-1 text-sm text-foreground/65">
                  Use the same selected scope in either surface and see whether
                  the reasoning still feels comfortable in the narrow rail.
                </p>
              </div>
              <Button
                variant={ButtonVariant.DEFAULT}
                onClick={() =>
                  openSeededConversation(buildBulkContext(selectedRows))
                }
              >
                <span className="inline-flex items-center gap-2">
                  <HiOutlineBolt className="h-4 w-4" />
                  Ask Agent About Selected Rows
                </span>
              </Button>
            </div>
          ) : null}

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-2">
            <AppTable<MissionControlRow>
              items={visibleRows}
              columns={columns}
              selectable
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              getItemId={(row) => row.id}
              getRowKey={(row) => row.id}
              onRowClick={(row) => openSeededConversation(buildRowContext(row))}
            />
          </div>
        </div>
      </Container>

      <AgentLabSurface
        context={activeContext}
        messages={messages}
        mode={mode}
        onClose={() => setSurfaceOpen(false)}
        onCopy={handleCopy}
        onSend={handleSend}
        open={surfaceOpen}
      />
    </div>
  );
}
