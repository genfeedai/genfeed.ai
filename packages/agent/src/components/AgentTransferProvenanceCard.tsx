import { AgentCardCollapseToggle } from '@genfeedai/agent/components/AgentCardCollapseToggle';
import {
  AGENT_CONVERSATION_INLINE_ROW_CLASS,
  AGENT_CONVERSATION_SURFACE_CLASS,
} from '@genfeedai/agent/constants/conversation-layout.constant';
import type {
  AgentUiAction,
  AgentUiActionHandler,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { AgentTransferPresentation } from '@genfeedai/contracts/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  Loader2,
  RotateCcw,
  Send,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactElement, useMemo, useState } from 'react';

interface AgentTransferProvenanceCardProps {
  action: AgentUiAction;
  apiService?: AgentApiService;
  onCopy?: (content: string) => void | Promise<void>;
  onUiAction?: AgentUiActionHandler;
}

const TERMINAL_SUCCESS = new Set(['COMPLETED', 'DELIVERED']);
const ACTIVE = new Set(['PENDING', 'QUEUED', 'RUNNING']);

function readTransfer(action: AgentUiAction): AgentTransferPresentation | null {
  const transfer = action.data?.transfer;
  return transfer && typeof transfer === 'object'
    ? (transfer as AgentTransferPresentation)
    : null;
}

export function AgentTransferProvenanceCard({
  action,
  apiService,
  onCopy,
  onUiAction,
}: AgentTransferProvenanceCardProps): ReactElement {
  const translate = useTranslations('agent.transferProvenance');
  const transfer = readTransfer(action);
  const direction =
    transfer?.direction ??
    (action.data?.direction === 'inbound' ? 'inbound' : 'outbound');
  const persistedStatus =
    transfer?.status ?? String(action.data?.status ?? 'PENDING');
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const status = localStatus ?? persistedStatus;
  const content = transfer?.content ?? String(action.data?.content ?? '');
  const counterpartId =
    direction === 'inbound'
      ? transfer?.sourceThreadId
      : (transfer?.destinationThreadId ??
        (typeof action.data?.destinationThreadId === 'string'
          ? action.data.destinationThreadId
          : undefined));
  const counterpartTitle =
    direction === 'inbound'
      ? transfer?.sourceThreadTitle
      : transfer?.destinationThreadTitle;
  const isFailed = status === 'FAILED' || status === 'DEPTH_LIMIT_REACHED';
  const [isExpanded, setIsExpanded] = useState(isFailed);
  const [isRetrying, setIsRetrying] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const createdAt = transfer?.createdAt
    ? new Date(transfer.createdAt).toLocaleString()
    : null;

  const statusLabel = useMemo(() => {
    if (status === 'DEPTH_LIMIT_REACHED') return 'Loop limit reached';
    return status.toLowerCase().replaceAll('_', ' ');
  }, [status]);

  const StatusIcon = TERMINAL_SUCCESS.has(status)
    ? CheckCircle2
    : isFailed
      ? XCircle
      : ACTIVE.has(status)
        ? Loader2
        : Send;
  const primaryCta = action.ctas?.find(
    (cta) => cta.action === 'confirm_agent_transfer',
  );

  const copy = async () => {
    if (onCopy) {
      await onCopy(content);
      return;
    }
    await navigator.clipboard.writeText(content);
  };

  const retry = async () => {
    if (!apiService || !transfer?.id || isRetrying) return;
    setIsRetrying(true);
    setLocalError(null);
    try {
      await apiService.retryAgentTransfer(transfer.id);
      setLocalStatus('QUEUED');
    } catch (error: unknown) {
      setLocalError(error instanceof Error ? error.message : 'Retry failed.');
    } finally {
      setIsRetrying(false);
    }
  };

  const header = (
    <div className="flex min-w-0 items-center gap-2">
      {direction === 'inbound' ? (
        <ArrowDownLeft className="size-4 shrink-0 text-primary" />
      ) : (
        <ArrowUpRight className="size-4 shrink-0 text-primary" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground/90">
          {direction === 'inbound' ? 'Received from' : 'Sent to'}{' '}
          {counterpartTitle || 'conversation'}
        </div>
      </div>
      <span
        aria-live="polite"
        className={cn(
          'inline-flex items-center gap-1 text-xs capitalize',
          isFailed ? 'text-destructive' : 'text-muted-foreground',
        )}
        role="status"
      >
        <StatusIcon
          aria-hidden="true"
          className={cn('size-3.5', ACTIVE.has(status) && 'animate-spin')}
        />
        {statusLabel}
      </span>
      <AgentCardCollapseToggle
        isCollapsed={!isExpanded}
        labelCollapse="Collapse transfer details"
        labelExpand="Expand transfer details"
        onToggle={() => setIsExpanded((value) => !value)}
      />
    </div>
  );

  if (!isExpanded) {
    return (
      <div
        className={AGENT_CONVERSATION_INLINE_ROW_CLASS}
        data-testid="agent-transfer-card"
      >
        {header}
      </div>
    );
  }

  return (
    <section
      aria-label="Conversation transfer"
      className={cn(AGENT_CONVERSATION_SURFACE_CLASS, 'my-2 space-y-3 p-3')}
      data-testid="agent-transfer-card"
    >
      {header}
      <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/85">
        {content}
      </p>
      {transfer?.completionSummary ? (
        <p className="border-l-2 border-success/40 pl-3 text-sm text-muted-foreground">
          {transfer.completionSummary}
        </p>
      ) : null}
      {transfer?.failureReason || localError ? (
        <p className="text-sm text-destructive" role="alert">
          {localError ?? transfer?.failureReason}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          aria-label="Copy transferred context"
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
          onClick={() => void copy()}
        >
          <Clipboard className="size-3.5" />
          {translate('copy')}
        </Button>
        {counterpartId ? (
          <Button
            asChild
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            <a href={`/agent/${encodeURIComponent(counterpartId)}`}>
              <ExternalLink className="size-3.5" />
              {translate('openConversation')}
            </a>
          </Button>
        ) : null}
        {primaryCta?.action ? (
          <Button
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
            withWrapper={false}
            onClick={() =>
              void onUiAction?.(primaryCta.action ?? '', primaryCta.payload)
            }
          >
            <Send className="size-3.5" />
            {primaryCta.label}
          </Button>
        ) : null}
        {status === 'FAILED' && transfer?.deliveryMode === 'SEND_AND_RUN' ? (
          <Button
            isDisabled={!apiService || isRetrying}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
            onClick={() => void retry()}
          >
            <RotateCcw
              className={cn('size-3.5', isRetrying && 'animate-spin')}
            />
            {isRetrying ? 'Retrying…' : 'Retry'}
          </Button>
        ) : null}
        {createdAt ? (
          <time className="ml-auto text-xs text-muted-foreground">
            {createdAt}
          </time>
        ) : null}
      </div>
    </section>
  );
}
