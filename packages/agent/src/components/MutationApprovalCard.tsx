import type {
  AgentUiAction,
  AgentUiActionHandler,
} from '@genfeedai/agent/models/agent-chat.model';
import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import { type ReactElement, useRef, useState } from 'react';

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
  const [resolved, setResolved] = useState<{
    id: string;
    status: 'approved' | 'declined';
  } | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [hasError, setHasError] = useState(false);
  const inFlight = useRef(false);
  const status =
    approval?.status !== 'pending'
      ? approval?.status
      : resolved?.id === approval?.approvalId
        ? resolved?.status
        : 'pending';

  async function respond(decision: 'approved' | 'declined') {
    if (!approval || !onUiAction || status !== 'pending' || inFlight.current)
      return;
    inFlight.current = true;
    setIsPending(true);
    setHasError(false);
    try {
      const accepted = await onUiAction(
        decision === 'approved' ? 'confirm_mutation' : 'decline_mutation',
        {
          approvalId: approval.approvalId,
          sourceActionId: approval.sourceActionId,
        },
      );
      if (accepted !== true) {
        setHasError(true);
        return;
      }
      setResolved({ id: approval.approvalId, status: decision });
    } catch {
      setHasError(true);
    } finally {
      inFlight.current = false;
      setIsPending(false);
    }
  }

  if (!approval)
    return (
      <p className="my-2 p-4 text-sm text-muted-foreground" role="status">
        {translate('unavailable')}
      </p>
    );
  return (
    <div
      className="my-2 bg-background-secondary p-4 shadow-border"
      aria-busy={isPending}
    >
      <p className="whitespace-pre-wrap break-words text-sm font-medium text-foreground">
        {approval.summary}
      </p>
      {approval.items.length > 0 && (
        <dl className="mt-3 space-y-2">
          {approval.items.map((item, index) => (
            <div key={`${index}-${item.label}`}>
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className="whitespace-pre-wrap break-words text-sm text-foreground">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {status === 'pending' ? (
        <>
          {hasError && (
            <p className="mt-3 text-xs text-destructive" role="alert">
              {translate('error')}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <Button
              withWrapper={false}
              isDisabled={!onUiAction || isPending}
              isLoading={isPending}
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
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {translate(
            status === 'approved' && action.data?.executionStatus === 'failed'
              ? 'failed'
              : status === 'approved'
                ? 'approved'
                : 'declined',
          )}
        </p>
      )}
    </div>
  );
}
