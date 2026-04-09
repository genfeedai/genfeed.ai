'use client';

import { POST_QUICK_ACTIONS } from '@genfeedai/constants';
import {
  AI_ACTION_LABELS,
  AiActionType,
  ButtonSize,
  ButtonVariant,
  ComponentSize,
} from '@genfeedai/enums';
import type { PostQuickActionsProps } from '@props/posts/post-quick-actions.props';
import { AiActionsService } from '@services/ai/ai-actions.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Button } from '@ui/primitives/button';
import { useCallback, useState } from 'react';
import { HiSparkles } from 'react-icons/hi2';

const AI_QUICK_ACTIONS: Array<{ key: string; action: AiActionType }> = [
  { action: AiActionType.ADD_HASHTAGS, key: 'add-hashtags' },
  { action: AiActionType.HOOK_GENERATOR, key: 'hook-generator' },
  { action: AiActionType.ADAPT_PLATFORM, key: 'adapt-platform' },
];

/**
 * Quick action buttons for post enhancement (Shorten, Simplify, Boost + AI actions).
 * Each action sends a preset prompt to the enhance API and costs 1 credit.
 */
export default function PostQuickActions({
  postId,
  onEnhance,
  isEnhancing,
  enhancingAction,
  hasContent = true,
  className = '',
  orgId,
  token,
  content,
  onAiResult,
}: PostQuickActionsProps) {
  const [activeAiAction, setActiveAiAction] = useState<string | null>(null);

  const handleAiAction = useCallback(
    async (actionType: AiActionType) => {
      if (!orgId || !token || !content) {
        return;
      }

      setActiveAiAction(actionType);
      try {
        const service = AiActionsService.getInstance(token);
        const response = await service.execute(orgId, {
          action: actionType,
          content,
        });
        onAiResult?.(actionType, response.result);
      } catch (error) {
        logger.error(`PostQuickActions AI action ${actionType} failed`, error);
        NotificationsService.getInstance().error('AI action failed');
      } finally {
        setActiveAiAction(null);
      }
    },
    [orgId, token, content, onAiResult],
  );

  const isAnyActionActive = isEnhancing || activeAiAction !== null;

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {POST_QUICK_ACTIONS.map((action) => {
        const isThisActionEnhancing =
          isEnhancing && enhancingAction === action.key;

        return (
          <Button
            key={action.key}
            label={isThisActionEnhancing ? '' : action.label}
            icon={
              isThisActionEnhancing ? (
                <Spinner size={ComponentSize.XS} />
              ) : undefined
            }
            variant={ButtonVariant.GHOST}
            size={ButtonSize.XS}
            isDisabled={isAnyActionActive || !hasContent}
            onClick={() => onEnhance(postId, action.prompt, action.key)}
          />
        );
      })}

      {orgId && token && (
        <>
          <div className="w-px h-4 bg-border mx-1 self-center" />
          {AI_QUICK_ACTIONS.map(({ key, action }) => {
            const isThisActive = activeAiAction === action;
            return (
              <Button
                key={key}
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
                isDisabled={isAnyActionActive || !hasContent}
                onClick={() => handleAiAction(action)}
              />
            );
          })}
        </>
      )}
    </div>
  );
}
