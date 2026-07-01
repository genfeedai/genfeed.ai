import type {
  AgentChatMessage as AgentChatMessageModel,
  AgentToolCall,
} from '@genfeedai/agent/models/agent-chat.model';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import type { TableColumn } from '@props/ui/display/table.props';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import {
  type ReactElement,
  useCallback,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { HiOutlineBeaker } from 'react-icons/hi2';
import { AgentLabSurface } from './AgentLabSurface';
import { MissionControlBulkBar } from './MissionControlBulkBar';
import { MissionControlLabBanner } from './MissionControlLabBanner';
import { MissionControlStatsGrid } from './MissionControlStatsGrid';
import { MissionControlToolbar } from './MissionControlToolbar';

export type AgentLabMode = 'overlay' | 'rail';
export type AgentLabStatus =
  | 'blocked'
  | 'drafting'
  | 'needs-review'
  | 'ready'
  | 'scheduled';
export type AgentLabPriority = 'high' | 'low' | 'medium';
export type AgentLabContextKind = 'bulk' | 'page' | 'row';

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

export interface AgentLabContext {
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

interface MissionControlState {
  mode: AgentLabMode;
  search: string;
  statusFilter: AgentLabStatus | 'all';
  selectedIds: string[];
  activeContext: AgentLabContext | null;
  messages: AgentChatMessageModel[];
  surfaceOpen: boolean;
}

type MissionControlAction =
  | { type: 'SET_MODE'; payload: AgentLabMode }
  | { type: 'SET_SEARCH'; payload: string }
  | { type: 'SET_STATUS_FILTER'; payload: AgentLabStatus | 'all' }
  | { type: 'SET_SELECTED_IDS'; payload: string[] }
  | {
      type: 'OPEN_SEEDED_CONVERSATION';
      payload: {
        context: AgentLabContext;
        messages: AgentChatMessageModel[];
        threadId: string;
      };
    }
  | {
      type: 'SEND_MESSAGE';
      payload: {
        context: AgentLabContext;
        newMessages: AgentChatMessageModel[];
      };
    }
  | { type: 'CLOSE_SURFACE' }
  | { type: 'OPEN_EMPTY_SURFACE' }
  | { type: 'RESET' };

const INITIAL_STATE: MissionControlState = {
  mode: 'rail',
  search: '',
  statusFilter: 'all',
  selectedIds: [],
  activeContext: null,
  messages: [],
  surfaceOpen: false,
};

function missionControlReducer(
  state: MissionControlState,
  action: MissionControlAction,
): MissionControlState {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.payload };
    case 'SET_SEARCH':
      return { ...state, search: action.payload };
    case 'SET_STATUS_FILTER':
      return { ...state, statusFilter: action.payload };
    case 'SET_SELECTED_IDS':
      return { ...state, selectedIds: action.payload };
    case 'OPEN_SEEDED_CONVERSATION':
      return {
        ...state,
        activeContext: action.payload.context,
        messages: action.payload.messages,
        surfaceOpen: true,
      };
    case 'SEND_MESSAGE':
      return {
        ...state,
        activeContext: action.payload.context,
        messages: action.payload.newMessages,
        surfaceOpen: true,
      };
    case 'CLOSE_SURFACE':
      return { ...state, surfaceOpen: false };
    case 'OPEN_EMPTY_SURFACE':
      return { ...state, activeContext: null, messages: [], surfaceOpen: true };
    case 'RESET':
      return { ...state, search: '', statusFilter: 'all', selectedIds: [] };
    default:
      return state;
  }
}

export function MissionControlView({
  onStartNewThread,
}: {
  onStartNewThread: () => void;
}) {
  const [state, dispatch] = useReducer(missionControlReducer, INITIAL_STATE);
  const {
    mode,
    search,
    statusFilter,
    selectedIds,
    activeContext,
    messages,
    surfaceOpen,
  } = state;
  const activeThreadIdRef = useRef('lab-page');

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
    activeThreadIdRef.current = seeded.threadId;
    dispatch({
      type: 'OPEN_SEEDED_CONVERSATION',
      payload: {
        context,
        messages: seeded.messages,
        threadId: seeded.threadId,
      },
    });
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

      const threadId = activeThreadIdRef.current;
      const nextIndex = messages.length + 1;
      const newMessages: AgentChatMessageModel[] = [
        ...messages,
        {
          content: trimmed,
          createdAt: new Date().toISOString(),
          id: `user-${threadId}-${nextIndex}`,
          role: 'user',
          threadId,
        },
        {
          content: buildContextReply(trimmed, context, visibleRows),
          createdAt: new Date().toISOString(),
          id: `assistant-${threadId}-${nextIndex + 1}`,
          metadata: {
            toolCalls: [createToolCall(context, visibleRows.length, trimmed)],
          },
          role: 'assistant',
          threadId,
        },
      ];

      dispatch({ type: 'SEND_MESSAGE', payload: { context, newMessages } });
    },
    [activeContext, messages, search, selectedRows, statusFilter, visibleRows],
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
          <Button variant={ButtonVariant.SECONDARY} onClick={onStartNewThread}>
            Open Agent Workspace
          </Button>
        }
      >
        <div className="space-y-6">
          <MissionControlLabBanner
            mode={mode}
            onModeChange={(newMode) =>
              dispatch({ type: 'SET_MODE', payload: newMode })
            }
            onAskAboutTable={() =>
              openSeededConversation(
                buildPageContext(
                  search,
                  statusFilter,
                  visibleRows,
                  selectedRows,
                ),
              )
            }
          />

          <MissionControlStatsGrid stats={stats} />

          <MissionControlToolbar
            search={search}
            statusFilter={statusFilter}
            statusOptions={STATUS_OPTIONS}
            onSearchChange={(value) =>
              dispatch({ type: 'SET_SEARCH', payload: value })
            }
            onStatusFilterChange={(value) =>
              dispatch({ type: 'SET_STATUS_FILTER', payload: value })
            }
            onReset={() => dispatch({ type: 'RESET' })}
            onOpenEmptySurface={() => dispatch({ type: 'OPEN_EMPTY_SURFACE' })}
          />

          {selectedRows.length > 0 ? (
            <MissionControlBulkBar
              selectedCount={selectedRows.length}
              onAskAgent={() =>
                openSeededConversation(buildBulkContext(selectedRows))
              }
            />
          ) : null}

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-2">
            <AppTable<MissionControlRow>
              items={visibleRows}
              columns={columns}
              selectable
              selectedIds={selectedIds}
              onSelectionChange={(ids) =>
                dispatch({ type: 'SET_SELECTED_IDS', payload: ids })
              }
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
        onClose={() => dispatch({ type: 'CLOSE_SURFACE' })}
        onCopy={handleCopy}
        onSend={handleSend}
        open={surfaceOpen}
      />
    </div>
  );
}
