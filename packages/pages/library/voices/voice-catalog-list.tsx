'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { Voice } from '@models/ingredients/voice.model';
import Button from '@ui/buttons/base/Button';
import type { ReactNode } from 'react';

export interface VoiceCatalogListProps {
  children: ReactNode;
  hasActiveFilters: boolean;
  onCloneVoice: () => void;
  onClearFilters: () => void;
  voices: Voice[];
}

export default function VoiceCatalogList({
  children,
  hasActiveFilters,
  onClearFilters,
  onCloneVoice,
  voices,
}: VoiceCatalogListProps) {
  if (voices.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.02] p-8">
        <div className="max-w-xl space-y-4">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-white">
              {hasActiveFilters
                ? 'No voices match the current filters'
                : 'No voices available yet'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {hasActiveFilters
                ? 'Clear the current filters or clone a new voice sample to populate this library.'
                : 'Clone your first voice from an uploaded or recorded sample.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {hasActiveFilters ? (
              <Button onClick={onClearFilters} withWrapper={false}>
                Clear Filters
              </Button>
            ) : null}
            <Button
              onClick={onCloneVoice}
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            >
              Clone Voice
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ul className="space-y-3" data-testid="voice-catalog-list">
      {children}
    </ul>
  );
}
