'use client';

import type { AgentInputRequest } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonVariant } from '@genfeedai/contracts';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';

const MAX_CHOICE_CARDS = 5;

export function OnboardingChoiceCards({
  hiddenOptionIds,
  isSubmitting = false,
  onSubmit,
  request,
}: {
  hiddenOptionIds?: readonly string[];
  isSubmitting?: boolean;
  onSubmit: (answer: string, optionIds?: string[]) => void | Promise<void>;
  request: AgentInputRequest;
}): ReactElement {
  const translate = useTranslations('agent.inputRequest');
  const options = useMemo(
    () =>
      (request.options ?? [])
        .filter((option) => !hiddenOptionIds?.includes(option.id))
        .slice(0, MAX_CHOICE_CARDS),
    [hiddenOptionIds, request.options],
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const requestIdRef = useRef(request.inputRequestId);
  requestIdRef.current = request.inputRequestId;

  // biome-ignore lint/correctness/useExhaustiveDependencies: A new question clears the previous selection.
  useEffect(() => {
    setSelectedIds([]);
    setSubmissionError(null);
    submittingRef.current = false;
  }, [request.inputRequestId]);

  async function submit(answer: string, optionIds?: string[]): Promise<void> {
    if (!answer.trim() || isSubmitting || submittingRef.current) return;
    const requestId = request.inputRequestId;
    submittingRef.current = true;
    setSubmissionError(null);
    try {
      await onSubmit(answer.trim(), optionIds);
    } catch {
      if (requestIdRef.current === requestId) {
        setSubmissionError(translate('failed'));
      }
    } finally {
      if (requestIdRef.current === requestId) submittingRef.current = false;
    }
  }

  function isImmediate(optionId: string): boolean {
    const immediate = request.metadata?.submitImmediatelyOptionIds;
    return Array.isArray(immediate) && immediate.includes(optionId);
  }

  function toggleOption(optionId: string): void {
    if (isSubmitting || submittingRef.current) return;
    setSelectedIds((current) => {
      if (current.includes(optionId)) {
        return current.filter((id) => id !== optionId);
      }
      const limit = request.maxSelections ?? options.length;
      return current.length < limit ? [...current, optionId] : current;
    });
  }

  const selectedOptions = options.filter((option) =>
    selectedIds.includes(option.id),
  );

  return (
    <div className="flex flex-col gap-3" data-testid="onboarding-choice-cards">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-foreground">
          {request.title}
        </h3>
        <p className="text-xs leading-5 text-foreground/70">{request.prompt}</p>
      </div>
      {options.map((option) => (
        <Card
          data-testid="onboarding-choice-card"
          description={option.description}
          isDisabled={isSubmitting}
          isLabelWrapped
          isPressed={
            request.isMultiSelect ? selectedIds.includes(option.id) : undefined
          }
          key={option.id}
          label={option.label}
          onClick={() => {
            if (isImmediate(option.id) || !request.isMultiSelect) {
              void submit(option.label, [option.id]);
              return;
            }
            toggleOption(option.id);
          }}
        />
      ))}
      {request.isMultiSelect && selectedOptions.length > 0 ? (
        <div className="flex justify-end">
          <Button
            isDisabled={isSubmitting}
            onClick={() => {
              void submit(
                selectedOptions.map((option) => option.label).join(', '),
                selectedOptions.map((option) => option.id),
              );
            }}
            variant={ButtonVariant.DEFAULT}
            withWrapper={false}
          >
            {translate('continue')}
          </Button>
        </div>
      ) : null}
      {submissionError ? (
        <p className="text-xs text-destructive" role="alert">
          {submissionError}
        </p>
      ) : null}
    </div>
  );
}
