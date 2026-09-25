'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { AgentContextOverviewCardProps } from '@props/settings/agent-context.props';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Progress } from '@ui/primitives/progress';
import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type KeyboardEvent, useState } from 'react';

/** Model, credits per round, context budget, and a preview-query control. */
export default function AgentContextOverviewCard({
  isRefreshing,
  onPreview,
  onRefresh,
  snapshot,
}: AgentContextOverviewCardProps) {
  const translate = useTranslations('pages.brandAgentContext');
  const [draftQuery, setDraftQuery] = useState(snapshot.query);
  const { budget, model } = snapshot;
  const usagePercent =
    budget.capChars > 0
      ? Math.min(100, Math.round((budget.usedChars / budget.capChars) * 100))
      : 0;

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onPreview(draftQuery);
    }
  };

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card
        description={translate('model.description')}
        headerAction={
          <Button
            ariaLabel={translate('refresh')}
            icon={<RefreshCw className="size-3.5" />}
            isDisabled={isRefreshing}
            isLoading={isRefreshing}
            onClick={onRefresh}
            size={ButtonSize.XS}
            variant={ButtonVariant.GHOST}
          />
        }
        label={translate('model.title')}
      >
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{model.label ?? model.key}</p>
          {model.label ? (
            <p className="font-mono text-xs text-muted-foreground">
              {model.key}
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            {translate('model.credits', { credits: model.creditsPerRound })}
          </p>
        </div>
      </Card>

      <Card
        description={translate('budget.description')}
        label={translate('budget.title')}
      >
        <div className="flex flex-col gap-2">
          <Progress
            aria-label={translate('budget.title')}
            value={usagePercent}
          />
          <p className="text-sm">
            {translate('budget.usage', {
              cap: budget.capChars,
              used: budget.usedChars,
            })}
          </p>
          {budget.trimmedSections.length > 0 ? (
            <div className="flex flex-col gap-1">
              <Badge variant="warning">
                {translate('budget.trimmedTitle')}
              </Badge>
              {budget.trimmedSections.map((section) => (
                <p
                  className="text-xs text-muted-foreground"
                  key={section.header}
                >
                  {translate('budget.trimmedSection', {
                    header: section.header.replace(/^##\s+/, ''),
                    kept: section.keptChars,
                    original: section.originalChars,
                  })}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {translate('budget.fits')}
            </p>
          )}
        </div>
      </Card>

      <Card
        className="md:col-span-2"
        description={translate('preview.help')}
        label={translate('preview.label')}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            aria-label={translate('preview.label')}
            className="flex-1"
            onChange={(event) => setDraftQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={translate('preview.placeholder')}
            value={draftQuery}
          />
          <div className="flex gap-2">
            <Button
              isDisabled={isRefreshing}
              label={translate('preview.submit')}
              onClick={() => onPreview(draftQuery)}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
            />
            {snapshot.query ? (
              <Button
                isDisabled={isRefreshing}
                label={translate('preview.clear')}
                onClick={() => {
                  setDraftQuery('');
                  onPreview('');
                }}
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
              />
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}
