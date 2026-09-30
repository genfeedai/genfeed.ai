import { useAgentUiActionRequest } from '@genfeedai/agent/hooks/use-agent-ui-action-request';
import type {
  AgentUiAction,
  AgentUiActionHandler,
} from '@genfeedai/agent/models/agent-chat.model';
import { ButtonVariant } from '@genfeedai/contracts';
import { keyListItems } from '@genfeedai/helpers/ui/list/key-list-items';
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
  const request = useAgentUiActionRequest(onUiAction, { isVoidSuccess: false });
  const [lastDecision, setLastDecision] = useState<
    'approved' | 'declined' | null
  >(null);
  const inFlight = useRef(false);
  const payload = approval
    ? {
        approvalId: approval.approvalId,
        sourceActionId: approval.sourceActionId,
      }
    : undefined;
  const approvePhase = request.getPhase('confirm_mutation', payload);
  const declinePhase = request.getPhase('decline_mutation', payload);
  const lastPhase =
    lastDecision === 'approved'
      ? approvePhase
      : lastDecision === 'declined'
        ? declinePhase
        : 'idle';
  // A pending decision stays locked until its run settles (or a remount finds
  // it still reconciling); a failed one can be retried.
  const isPending =
    [approvePhase, declinePhase].includes('running') ||
    [approvePhase, declinePhase].includes('awaiting');
  const hasError = lastPhase === 'failed';
  const status =
    approval?.status !== 'pending'
      ? approval?.status
      : approvePhase === 'completed'
        ? 'approved'
        : declinePhase === 'completed'
          ? 'declined'
          : 'pending';

  async function respond(decision: 'approved' | 'declined') {
    if (
      !approval ||
      !onUiAction ||
      status !== 'pending' ||
      isPending ||
      inFlight.current
    )
      return;
    inFlight.current = true;
    setLastDecision(decision);
    try {
      await request.submit(
        decision === 'approved' ? 'confirm_mutation' : 'decline_mutation',
        payload,
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
