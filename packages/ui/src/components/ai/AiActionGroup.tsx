'use client';

import {
  AI_ACTION_LABELS,
  type AiActionType,
  ButtonSize,
  ButtonVariant,
  ComponentSize,
} from '@genfeedai/enums';
import type { AiActionGroupProps } from '@props/ai/ai-action.props';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Button } from '@ui/primitives/button';
import { useCallback, useState } from 'react';
import { HiSparkles } from 'react-icons/hi2';

interface AiActionGroupWithHookProps extends AiActionGroupProps {
  orgId: string;
  token: string;
}

export default function AiActionGroup({
  actions,
  content,
  context,
  onResult,
  className = '',
  isDisabled = false,
  orgId,
  token,
}: AiActionGroupWithHookProps) {
  const [activeAction, setActiveAction] = useState<AiActionType | null>(null);

  const handleAction = useCallback(
    async (action: AiActionType) => {
      setActiveAction(action);
      try {
        const service = (await import('@services/ai/ai-actions.service'))
          .AiActionsService;
        const instance = service.getInstance(token);
        const response = await instance.execute(orgId, {
          action,
          content,
          context,
        });
        onResult(action, response.result);
      } finally {
        setActiveAction(null);
      }
    },
    [content, context, onResult, orgId, token],
  );

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {actions.map((action) => {
        const isThisActive = activeAction === action;

        return (
          <Button
            key={action}
            label={isThisActive ? '' : AI_ACTION_LABELS[action]}
            icon={
              isThisActive ? (
                <Spinner size={ComponentSize.XS} />
              ) : (
                <HiSparkles className="w-3.5 h-3.5" />
              )
            }
            variant={ButtonVariant.GHOST}
            size={ButtonSize.XS}
            isDisabled={isDisabled || activeAction !== null || !content}
            onClick={() => handleAction(action)}
          />
        );
      })}
    </div>
  );
}
