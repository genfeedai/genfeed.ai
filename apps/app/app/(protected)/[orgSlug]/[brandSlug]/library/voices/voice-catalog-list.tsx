'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { Voice } from '@models/ingredients/voice.model';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

export interface VoiceCatalogListProps {
  children: ReactNode;
  generateHref?: string;
  hasActiveFilters: boolean;
  onCloneVoice: () => void;
  onClearFilters: () => void;
  voices: Voice[];
}

export default function VoiceCatalogList({
  children,
  generateHref,
  hasActiveFilters,
  onClearFilters,
  onCloneVoice,
  voices,
}: VoiceCatalogListProps) {
  const translate = useTranslations('common.actions');

  if (voices.length === 0) {
    return (
      <Card className="border-dashed" bodyClassName="p-8">
        <div className="max-w-xl space-y-4">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-foreground">
              {hasActiveFilters
                ? 'No voices match the current filters'
                : 'No voices available yet'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {hasActiveFilters
                ? 'Clear the current filters or clone a new voice sample to populate this library.'
                : 'Generate a voice with Agent or clone one from an uploaded or recorded sample.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {hasActiveFilters ? (
              <Button onClick={onClearFilters} withWrapper={false}>
                {translate('clearFilters')}
              </Button>
            ) : null}
            {generateHref ? (
              <Button asChild withWrapper={false}>
                <Link href={generateHref}>{translate('generateVoice')}</Link>
              </Button>
            ) : null}
            <Button
              onClick={onCloneVoice}
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            >
              {translate('cloneVoice')}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <ul className="space-y-3" data-testid="voice-catalog-list">
      {children}
    </ul>
  );
}
