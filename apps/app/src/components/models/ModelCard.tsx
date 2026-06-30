'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { ProviderModel } from '@genfeedai/types';
import { Button } from '@ui/primitives/button';
import { Clock, Sparkles } from 'lucide-react';
import Image from 'next/image';
import type { JSX } from 'react';
import { useState } from 'react';
import {
  CapabilityBadge,
  ProviderBadge,
  UseCaseBadge,
} from './ModelBrowserBadges';

// =============================================================================
// MODEL CARD
// =============================================================================

export type ModelCardProps = {
  model: ProviderModel;
  onSelect: (model: ProviderModel) => void;
  isRecent?: boolean;
};

export function ModelCard({ model, onSelect, isRecent }: ModelCardProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <Button
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      onClick={() => onSelect(model)}
      className="group w-full rounded-card border border-border bg-card text-left transition hover:border-primary overflow-hidden"
    >
      <div className="flex items-stretch">
        {/* Thumbnail or placeholder - full height */}
        {model.thumbnail && !imgError ? (
          <Image
            unoptimized
            src={model.thumbnail}
            alt={model.displayName}
            className="w-20 shrink-0 object-cover bg-secondary"
            onError={() => setImgError(true)}
            width={800}
            height={600}
          />
        ) : (
          <div className="flex w-20 shrink-0 items-center justify-center bg-secondary">
            <Sparkles className="size-6 text-muted-foreground" />
          </div>
        )}

        <div className="min-w-0 flex-1 p-4">
          {/* Name and provider */}
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-medium text-foreground">
              {model.displayName}
            </h3>
            {isRecent && <Clock className="size-3 text-muted-foreground" />}
          </div>

          {/* Model ID */}
          <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
            {model.id}
          </p>

          {/* Badges */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <ProviderBadge provider={model.provider} />
            {model.capabilities.map((cap) => (
              <CapabilityBadge key={cap} capability={cap} />
            ))}
            {model.useCases?.reduce<JSX.Element[]>((badges, uc) => {
              if (uc !== 'general') {
                badges.push(<UseCaseBadge key={uc} useCase={uc} />);
              }
              return badges;
            }, [])}
          </div>

          {/* Description and pricing */}
          {(model.description || model.pricing) && (
            <div className="mt-2 flex items-center justify-between gap-2">
              {model.description && (
                <p className="line-clamp-1 text-xs text-muted-foreground">
                  {model.description}
                </p>
              )}
              {model.pricing && (
                <span className="shrink-0 text-xs font-medium text-chart-2">
                  {model.pricing}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Button>
  );
}
