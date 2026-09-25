'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { IAgentMemoryEntry } from '@genfeedai/contracts/interfaces';
import type { AgentContextMemoriesSectionProps } from '@props/settings/agent-context.props';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Skeleton } from '@ui/primitives/skeleton';
import { Archive } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import AgentContextLayerCard from './agent-context-layer-card';

interface MemoryRowProps {
  action?: ReactNode;
  kind?: string | null;
  meta?: string;
  scopeLabel: string;
  text: string;
}

function MemoryRow({ action, kind, meta, scopeLabel, text }: MemoryRowProps) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{scopeLabel}</Badge>
          {kind ? <Badge variant="outline">{kind}</Badge> : null}
          {meta ? (
            <span className="text-xs text-muted-foreground">{meta}</span>
          ) : null}
        </span>
        <p className="text-sm break-words">{text}</p>
      </div>
      {action}
    </div>
  );
}

/**
 * Memories in three views: the ones ranked into this turn, every personal
 * memory the viewer owns (archivable), and the brand's shared memories.
 */
export default function AgentContextMemoriesSection({
  brandMemories,
  editHrefs,
  injectedMemories,
  injectedStatus,
  isMemoriesError,
  onArchive,
  pendingMemoryId,
  personalMemories,
}: AgentContextMemoriesSectionProps) {
  const translate = useTranslations('pages.brandAgentContext');

  const scopeLabel = (scope?: string | null) =>
    scope === 'brand' || scope === 'org' || scope === 'personal'
      ? translate(`memories.scope.${scope}`)
      : (scope ?? '');

  const archiveButton = (memoryId: string) => (
    <Button
      ariaLabel={translate('memories.archive')}
      icon={<Archive className="size-3.5" />}
      isDisabled={pendingMemoryId === memoryId}
      isLoading={pendingMemoryId === memoryId}
      onClick={() => onArchive(memoryId)}
      size={ButtonSize.XS}
      tooltip={translate('memories.archive')}
      variant={ButtonVariant.GHOST}
    />
  );

  const renderList = (
    entries: IAgentMemoryEntry[] | null,
    emptyLabel: string,
    isArchivable: boolean,
  ) => {
    if (entries === null) {
      return <Skeleton className="h-16 w-full" />;
    }
    if (isMemoriesError) {
      return (
        <p className="text-sm text-muted-foreground">
          {translate('memories.loadError')}
        </p>
      );
    }
    if (entries.length === 0) {
      return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
    }
    return (
      <div className="flex flex-col">
        {entries.map((entry) => (
          <MemoryRow
            action={isArchivable ? archiveButton(entry.id) : undefined}
            key={entry.id}
            kind={entry.kind}
            scopeLabel={scopeLabel(entry.scope)}
            text={entry.summary || entry.content || ''}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3" id="agent-context-memories">
      <AgentContextLayerCard
        editHrefs={editHrefs}
        layerKey="memories"
        status={injectedStatus}
      >
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {translate('memories.injectedDescription')}
          </p>
          <div className="flex flex-col">
            {injectedMemories.map((memory) => (
              <MemoryRow
                action={
                  memory.isOwnedByRequester
                    ? archiveButton(memory.id)
                    : undefined
                }
                key={memory.id}
                kind={memory.kind}
                meta={
                  typeof memory.score === 'number'
                    ? translate('memories.score', {
                        score: memory.score.toFixed(1),
                      })
                    : undefined
                }
                scopeLabel={scopeLabel(memory.scope)}
                text={memory.summary || memory.content || ''}
              />
            ))}
          </div>
        </div>
      </AgentContextLayerCard>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card
          description={translate('memories.personalDescription')}
          label={translate('memories.personalTitle')}
        >
          {renderList(
            personalMemories,
            translate('memories.personalEmpty'),
            true,
          )}
        </Card>
        <Card
          description={translate('memories.brandDescription')}
          label={translate('memories.brandTitle')}
        >
          {renderList(brandMemories, translate('memories.brandEmpty'), false)}
        </Card>
      </div>
    </div>
  );
}
