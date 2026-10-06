import { useAgentUiActionRequest } from '@genfeedai/agent/hooks/use-agent-ui-action-request';
import type {
  AgentUiAction,
  AgentUiActionHandler,
} from '@genfeedai/agent/models/agent-chat.model';
import { formatAgentError } from '@genfeedai/agent/utils/format-agent-error.util';
import { ButtonVariant } from '@genfeedai/contracts';
import { keyListItems } from '@genfeedai/helpers/ui/list/key-list-items';
import { Button } from '@ui/primitives/button';
import { AlertTriangle, ChevronDown, Clock3 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactElement, useEffect, useId, useRef, useState } from 'react';

interface MutationApprovalCardProps {
  action: AgentUiAction;
  onUiAction?: AgentUiActionHandler;
}

function isApprovalStatus(
  value: unknown,
): value is 'pending' | 'approved' | 'declined' {
  return value === 'pending' || value === 'approved' || value === 'declined';
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function readApproval(data: AgentUiAction['data']) {
  if (
    !data ||
    !isNonemptyString(data.approvalId) ||
    !isNonemptyString(data.sourceActionId) ||
    !isNonemptyString(data.summary) ||
    !Array.isArray(data.items) ||
    !isApprovalStatus(data.status)
  )
    return null;
  const items: Array<{ label: string; value: string }> = [];
  for (const item of data.items) {
    if (
      !item ||
      typeof item !== 'object' ||
      !isNonemptyString(item.label) ||
      !isNonemptyString(item.value)
    )
      return null;
    items.push({ label: item.label, value: item.value });
  }
  return {
    approvalId: data.approvalId,
    expiresAt:
      typeof data.expiresAt === 'string' ? Date.parse(data.expiresAt) : NaN,
    items,
    sourceActionId: data.sourceActionId,
    status: data.status,
    summary: data.summary,
  };
}

export function MutationApprovalCard({
  action,
  onUiAction,
}: MutationApprovalCardProps): ReactElement {
  const translate = useTranslations('agent.mutationApproval');
  const approval = readApproval(action.data);
  const request = useAgentUiActionRequest(onUiAction, { isVoidSuccess: false });
  const [now, setNow] = useState(Date.now);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  const inFlight = useRef(false);
  const payload = approval
    ? {
        approvalId: approval.approvalId,
        sourceActionId: approval.sourceActionId,
      }
    : undefined;
  const approvePhase = request.getPhase('confirm_mutation', payload);
  const declinePhase = request.getPhase('decline_mutation', payload);
  const preparePhase = request.getPhase('reprepare_mutation', payload);
  const reviewPayload = approval
    ? {
        sourceActionId: approval.sourceActionId,
        prompt: `Review the failed action "${approval.summary}" (approval ${approval.approvalId}). Check its saved result and any partial changes before proposing a new action. Show a new preview if needed. Do not approve or execute anything automatically.`,
      }
    : undefined;
  const reviewPhase = request.getPhase('send_prompt', reviewPayload);
  const decisionInFlight = [approvePhase, declinePhase].some(
    (phase) => phase === 'running' || phase === 'awaiting',
  );
  const isPending =
    decisionInFlight ||
    [preparePhase, reviewPhase].some(
      (phase) => phase === 'running' || phase === 'awaiting',
    );
  const status =
    approval?.status !== 'pending'
      ? approval?.status
      : approvePhase === 'completed'
        ? 'approved'
        : declinePhase === 'completed'
          ? 'declined'
          : 'pending';
  const hasError =
    status === 'pending' &&
    [approvePhase, declinePhase, preparePhase, reviewPhase].includes('failed');
  const expiresAt = approval?.expiresAt ?? NaN;
  const expired =
    status === 'pending' &&
    !decisionInFlight &&
    (!Number.isFinite(expiresAt) || expiresAt <= now);
  const executionFailed =
    status === 'approved' && action.data?.executionStatus === 'failed';
  const rawError =
    typeof action.data?.error === 'string'
      ? action.data.error
      : (request.getError('confirm_mutation', payload) ??
        request.getError('decline_mutation', payload) ??
        request.getError('reprepare_mutation', payload) ??
        request.getError('send_prompt', reviewPayload));
  const detail = rawError ? formatAgentError(rawError).detail : null;

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    refresh();
    if (status !== 'pending' || !Number.isFinite(expiresAt)) return;
    const timer = window.setTimeout(
      refresh,
      Math.max(0, expiresAt - Date.now()),
    );
    // Background tabs can delay timers. Reconcile against the wall clock on return.
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [expiresAt, status]);

  async function respond(decision: 'approved' | 'declined') {
    if (
      !approval ||
      !onUiAction ||
      status !== 'pending' ||
      isPending ||
      inFlight.current
    )
      return;
    // Recheck at click time, including clicks before a suspended timer has fired.
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      setNow(Date.now());
      return;
    }
    inFlight.current = true;
    try {
      await request.submit(
        decision === 'approved' ? 'confirm_mutation' : 'decline_mutation',
        payload,
      );
    } finally {
      inFlight.current = false;
    }
  }

  async function recover() {
    if (
      !approval ||
      !onUiAction ||
      isPending ||
      inFlight.current ||
      (!expired && !executionFailed)
    )
      return;
    inFlight.current = true;
    try {
      await request.submit(
        expired ? 'reprepare_mutation' : 'send_prompt',
        expired ? payload : reviewPayload,
      );
    } finally {
      inFlight.current = false;
    }
  }

  if (!approval)
    return (
      <p className="my-2 p-4 text-sm text-muted-foreground" role="status">
        {translate('unavailable')}
      </p>
    );
  const RecoveryIcon = expired ? Clock3 : AlertTriangle;
  return (
    <div
      className="my-2 rounded-lg border border-border bg-background-secondary p-4"
      aria-busy={isPending}
    >
      <p className="whitespace-pre-wrap break-words text-sm font-medium text-foreground">
        {approval.summary}
      </p>
      {approval.items.length > 0 && (
        <dl className="mt-3 space-y-2">
          {keyListItems(approval.items, (item) => JSON.stringify(item)).map(
            ({ item, key }) => (
              <div key={key}>
                <dt className="text-xs text-muted-foreground">{item.label}</dt>
                <dd className="whitespace-pre-wrap break-words text-sm text-foreground">
                  {item.value}
                </dd>
              </div>
            ),
          )}
        </dl>
      )}
      {(expired || executionFailed || hasError) && (
        <div
          className={`mt-4 rounded-lg border p-3 ${expired ? 'border-warning/50 bg-warning/10' : 'border-destructive/50 bg-destructive/10'}`}
          role={expired ? 'status' : 'alert'}
        >
          <div className="flex flex-wrap items-start gap-3">
            <span
              className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${expired ? 'bg-warning/15 text-warning' : 'bg-destructive/15 text-destructive'}`}
            >
              <RecoveryIcon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-semibold ${expired ? 'text-warning' : 'text-destructive'}`}
              >
                {translate(
                  expired
                    ? 'expiredTitle'
                    : executionFailed
                      ? 'failedTitle'
                      : 'responseFailedTitle',
                )}
              </p>
              <p className="mt-1 text-sm text-foreground">
                {translate(
                  expired
                    ? 'expiredDescription'
                    : executionFailed
                      ? 'failedDescription'
                      : 'error',
                )}
              </p>
              {expired && preparePhase === 'failed' && (
                <p className="mt-1 text-sm text-foreground">
                  {translate('prepareFailed')}
                </p>
              )}
            </div>
            {(expired || executionFailed) &&
              (reviewPhase === 'completed' ? (
                <p className="text-sm text-muted-foreground">
                  {translate('reviewRequested')}
                </p>
              ) : (
                <Button
                  withWrapper={false}
                  isDisabled={!onUiAction || isPending}
                  aria-label={translate(
                    expired ? 'prepareAgain' : 'reviewChanges',
                  )}
                  isLoading={isPending}
                  onClick={() => void recover()}
                >
                  {translate(expired ? 'prepareAgain' : 'reviewChanges')}
                </Button>
              ))}
          </div>
          {detail && (
            <div className="mt-3 border-t border-border pt-2">
              <Button
                variant={ButtonVariant.GHOST}
                withWrapper={false}
                className="h-auto px-0 py-1 text-xs text-muted-foreground"
                aria-expanded={detailsOpen}
                aria-controls={detailsId}
                onClick={() => setDetailsOpen((open) => !open)}
              >
                <ChevronDown
                  className={`size-3 ${detailsOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
                {translate('technicalDetails')}
              </Button>
              {detailsOpen && (
                <p
                  id={detailsId}
                  className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground"
                >
                  {detail}
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {status === 'pending'
        ? !expired && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                withWrapper={false}
                isDisabled={!onUiAction || isPending}
                aria-label={translate('approve')}
                isLoading={decisionInFlight}
                onClick={() => void respond('approved')}
              >
                {translate('approve')}
              </Button>
              <Button
                variant={ButtonVariant.SECONDARY}
                withWrapper={false}
                isDisabled={!onUiAction || isPending}
                onClick={() => void respond('declined')}
              >
                {translate('decline')}
              </Button>
            </div>
          )
        : !executionFailed && (
            <p className="mt-3 text-sm text-muted-foreground" role="status">
              {translate(status === 'approved' ? 'approved' : 'declined')}
            </p>
          )}
    </div>
  );
}
