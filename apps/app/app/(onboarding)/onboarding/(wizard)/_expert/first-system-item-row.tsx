'use client';

import {
  ButtonSize,
  ButtonVariant,
  ContentPlanItemStatus,
} from '@genfeedai/contracts';
import type { FirstSystemItemRowProps } from '@props/onboarding/expert-path.props';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const STATUS_LABEL_KEY: Record<ContentPlanItemStatus, string> = {
  [ContentPlanItemStatus.COMPLETED]: 'completed',
  [ContentPlanItemStatus.EXECUTING]: 'executing',
  [ContentPlanItemStatus.FAILED]: 'failed',
  [ContentPlanItemStatus.PENDING]: 'pending',
  [ContentPlanItemStatus.SKIPPED]: 'skipped',
};

export default function FirstSystemItemRow({
  connectToSchedulePlatforms,
  isBusy,
  item,
  onApprove,
  onEdit,
  onReject,
}: FirstSystemItemRowProps) {
  const translate = useTranslations('pages.onboarding.expert.firstSystem');
  const [isEditing, setIsEditing] = useState(false);
  const [topic, setTopic] = useState(item.topic);
  const isPending = item.status === ContentPlanItemStatus.PENDING;

  return (
    <li className="space-y-3 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          {isEditing ? (
            <Input
              aria-label={translate('topicLabel')}
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
            />
          ) : (
            <p className="text-sm font-medium text-foreground">{item.topic}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {item.platforms.join(', ')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {translate(`status.${STATUS_LABEL_KEY[item.status]}`)}
          </Badge>
          {connectToSchedulePlatforms.length > 0 && isPending ? (
            <Badge variant="warning">
              {translate('connectToSchedule', {
                platforms: connectToSchedulePlatforms.join(', '),
              })}
            </Badge>
          ) : null}
        </div>
      </div>

      {isPending ? (
        <div className="flex flex-wrap gap-2">
          {isEditing ? (
            <>
              <Button
                variant={ButtonVariant.DEFAULT}
                size={ButtonSize.SM}
                label={translate('save')}
                isDisabled={!topic.trim() || topic.trim() === item.topic}
                isLoading={isBusy}
                onClick={() => {
                  onEdit(item, topic.trim());
                  setIsEditing(false);
                }}
                className="rounded-none"
              />
              <Button
                variant={ButtonVariant.GHOST}
                size={ButtonSize.SM}
                label={translate('cancel')}
                onClick={() => {
                  setTopic(item.topic);
                  setIsEditing(false);
                }}
                className="rounded-none"
              />
            </>
          ) : (
            <>
              <Button
                variant={ButtonVariant.DEFAULT}
                size={ButtonSize.SM}
                label={translate('approve')}
                isLoading={isBusy}
                onClick={() => onApprove(item)}
                className="rounded-none"
              />
              <Button
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.SM}
                label={translate('edit')}
                isDisabled={isBusy}
                onClick={() => setIsEditing(true)}
                className="rounded-none"
              />
              <Button
                variant={ButtonVariant.GHOST}
                size={ButtonSize.SM}
                label={translate('reject')}
                isDisabled={isBusy}
                onClick={() => onReject(item)}
                className="rounded-none"
              />
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}
