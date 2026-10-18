import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { ReviewInboxDecision } from '@genfeedai/contracts/interfaces';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Check, ClipboardList, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { AgentErrorMessage } from './AgentErrorMessage';

interface ReviewItem {
  /** A review inbox item id; the API routes it to the gate that owns it. */
  id: string;
  title: string;
  type?: string;
  platform?: string;
  previewUrl?: string;
}

interface ReviewGateCardProps {
  action: AgentUiAction;
  /** Absent while the conversation is read-only: decisions stay unavailable. */
  apiService?: AgentApiService;
}

export function ReviewGateCard({
  action,
  apiService,
}: ReviewGateCardProps): ReactElement {
  const translate = useTranslations('agent.reviewGateCard');
  const items = (action.items ?? []) as ReviewItem[];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [submittedCount, setSubmittedCount] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partialCount, setPartialCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const pendingItems = items.filter((item) => !resolvedIds.has(item.id));
  const isDecisionAvailable = Boolean(apiService) && !isSubmitting;

  const toggleItem = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(pendingItems.map((item) => item.id)));
  }, [pendingItems]);

  const submit = useCallback(
    async (decision: ReviewInboxDecision) => {
      if (!apiService || selected.size === 0) return;
      const ids = Array.from(selected);
      const controller = new AbortController();
      abortRef.current = controller;
      setIsSubmitting(true);
      setError(null);

      const landed: string[] = [];
      try {
        // One item at a time, so a failure never hides the ones that landed.
        for (const id of ids) {
          await apiService.resolveReviewInboxItem(
            id,
            decision,
            controller.signal,
          );
          landed.push(id);
        }
        setSubmittedCount(ids.length);
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        setPartialCount(landed.length);
        setError(err instanceof Error ? err.message : translate('failed'));
      } finally {
        if (!controller.signal.aborted) {
          setResolvedIds((prev) => new Set([...prev, ...landed]));
          setSelected((prev) => {
            const next = new Set(prev);
            for (const id of landed) next.delete(id);
            return next;
          });
          setIsSubmitting(false);
        }
      }
    },
    [apiService, selected, translate],
  );

  const handleApprove = useCallback(() => submit('approve'), [submit]);
  const handleReject = useCallback(() => submit('reject'), [submit]);

  if (submittedCount !== null) {
    return (
      <div className="border border-success/20  bg-success/10  p-4 my-2">
        <div className="flex items-center gap-2 text-success ">
          <Check className="size-5" />
          <span className="text-sm font-medium">
            {translate('submitted', { count: submittedCount })}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border bg-background p-4 my-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="size-5 text-amber-500" />
          <h3 className="font-semibold text-sm">
            {action.title || translate('defaultTitle')}
          </h3>
        </div>
        <Button
          variant={ButtonVariant.GHOST}
          size={ButtonSize.XS}
          onClick={selectAll}
          isDisabled={!isDecisionAvailable}
          className="text-blue-500 hover:text-info"
        >
          {translate('selectAll')}
        </Button>
      </div>

      {action.description && (
        <p className="text-xs text-muted-foreground mb-3">
          {action.description}
        </p>
      )}

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {pendingItems.map((item) => (
          <label
            key={item.id}
            className={`flex items-center gap-3 p-2 cursor-pointer transition-colors ${
              selected.has(item.id)
                ? 'bg-info/10  border border-info/20 '
                : 'bg-muted border border-transparent'
            }`}
          >
            <Checkbox
              isChecked={selected.has(item.id)}
              isDisabled={!isDecisionAvailable}
              onChange={() => toggleItem(item.id)}
              className="rounded border-zinc-300 text-primary"
            />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium truncate block">
                {item.title}
              </span>
              {(item.type || item.platform) && (
                <span className="text-xs text-muted-foreground">
                  {[item.type, item.platform].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
          </label>
        ))}
      </div>

      {pendingItems.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          {translate('empty')}
        </p>
      )}

      {error && (
        <div className="mt-3">
          <AgentErrorMessage message={error} />
          {partialCount > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {translate('partiallySubmitted', { count: partialCount })}
            </p>
          )}
        </div>
      )}

      {!apiService && pendingItems.length > 0 && (
        <p className="text-xs text-muted-foreground mt-3">
          {translate('readOnly')}
        </p>
      )}

      {pendingItems.length > 0 && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-border">
          <Button
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.SM}
            onClick={handleApprove}
            isDisabled={!isDecisionAvailable || selected.size === 0}
            isLoading={isSubmitting}
            className="bg-success text-success-foreground hover:bg-success/90"
          >
            <Check className="size-3.5" />
            {translate('approve', { count: selected.size })}
          </Button>
          <Button
            variant={ButtonVariant.DESTRUCTIVE}
            size={ButtonSize.SM}
            onClick={handleReject}
            isDisabled={!isDecisionAvailable || selected.size === 0}
            className="bg-destructive/10 text-destructive hover:bg-destructive/10  "
          >
            <X className="size-3.5" />
            {translate('reject', { count: selected.size })}
          </Button>
        </div>
      )}
    </div>
  );
}
