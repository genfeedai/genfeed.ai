'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ModelSelectorModelSpecProps } from '@genfeedai/props/ui/model-selector/model-selector.props';
import ModelSelectorBrandMark from '@ui/dropdowns/model-selector/ModelSelectorBrandMark';
import {
  buildPricingLabel,
  getModelSpecCapabilities,
} from '@ui/dropdowns/model-selector/model-selector.utils';
import { memo } from 'react';

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-foreground/40">
        {label}
      </span>
      <span className="min-w-0 flex-1 text-xs font-normal text-foreground/80 tabular-nums">
        {value}
      </span>
    </div>
  );
}

/**
 * The detail the flat row deliberately drops. Rows carry a name, two capability
 * icons and a price tier; everything else about a model lives here and is
 * revealed on hover, so scanning stays cheap and comparing stays possible.
 */
const ModelSelectorModelSpec = memo(function ModelSelectorModelSpec({
  option,
  lockReason,
}: ModelSelectorModelSpecProps) {
  const { model, brandLabel } = option;
  const capabilities = getModelSpecCapabilities(model);
  const pricingLabel = buildPricingLabel(model);
  const costLabel = [
    typeof model.cost === 'number' && model.cost > 0
      ? `${model.cost} credits`
      : '',
    pricingLabel && pricingLabel !== String(model.cost) ? pricingLabel : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex w-64 flex-col gap-2">
      <div className="flex items-center gap-2">
        <ModelSelectorBrandMark
          brandColor={option.brandColor}
          brandIcon={option.brandIcon}
          brandLabel={brandLabel}
          testId="model-spec-provider-icon"
        />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-xs font-semibold text-foreground">
            {model.label}
          </span>
          <span className="truncate text-[10px] font-normal text-foreground/50">
            {brandLabel}
          </span>
        </div>
      </div>

      {model.description ? (
        <p className="text-xs font-normal leading-relaxed text-foreground/70">
          {model.description}
        </p>
      ) : null}

      <div className="flex flex-col gap-1 border-t border-border pt-2">
        {model.speedTier ? (
          <SpecRow label="Speed" value={titleCase(model.speedTier)} />
        ) : null}
        {model.qualityTier ? (
          <SpecRow label="Quality" value={titleCase(model.qualityTier)} />
        ) : null}
        {costLabel ? <SpecRow label="Cost" value={costLabel} /> : null}
        {model.durations?.length ? (
          <SpecRow
            label="Duration"
            value={model.durations.map((duration) => `${duration}s`).join(', ')}
          />
        ) : null}
        {model.aspectRatios?.length ? (
          <SpecRow label="Ratios" value={model.aspectRatios.join(', ')} />
        ) : null}
        {typeof model.maxOutputs === 'number' && model.maxOutputs > 1 ? (
          <SpecRow label="Outputs" value={`Up to ${model.maxOutputs}`} />
        ) : null}
        {model.recommendedFor?.length ? (
          <SpecRow label="Best for" value={model.recommendedFor.join(', ')} />
        ) : null}
      </div>

      {capabilities.length > 0 ? (
        <div className="flex flex-wrap gap-1 border-t border-border pt-2">
          {capabilities.map((capability) => {
            const CapabilityIcon = capability.icon;

            return (
              <span
                key={capability.id}
                className="flex items-center gap-1 rounded-full border border-border bg-background-tertiary px-1.5 py-0.5 text-[10px] font-medium text-foreground/70"
              >
                <CapabilityIcon className="size-3" aria-hidden />
                {capability.label}
              </span>
            );
          })}
        </div>
      ) : null}

      {lockReason ? (
        <p
          className={cn(
            'rounded-sm border border-destructive/20 bg-destructive/10 px-1.5 py-1',
            'text-[10px] font-medium text-destructive',
          )}
        >
          {lockReason}
        </p>
      ) : null}
    </div>
  );
});

export default ModelSelectorModelSpec;
