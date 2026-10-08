'use client';

import {
  MODEL_FORMATS,
  MODEL_PRIORITIES,
  type ModelFormat,
  type ModelOrientation,
  type ModelPriority,
  matchesOrientation,
  selectModels,
} from '@data/ai-model-selector';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { AiModelSelectorProps } from '@props/tools/ai-model-selector.props';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { ArrowRight, Copy } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

const ORIENTATIONS = [
  { label: 'Any ratio', value: 'any' },
  { label: 'Portrait', value: 'portrait' },
  { label: 'Landscape', value: 'landscape' },
  { label: 'Square', value: 'square' },
] as const;

export default function AiModelSelectorContent({
  models,
}: AiModelSelectorProps): React.ReactElement {
  const [format, setFormat] = useState<ModelFormat>('image');
  const [priority, setPriority] = useState<ModelPriority>('default');
  const [orientation, setOrientation] = useState<ModelOrientation>('any');
  const [query, setQuery] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const matches = selectModels(
    models ?? [],
    format,
    priority,
    orientation,
    query,
  );
  const shortlist = matches.slice(0, 3);
  const hasVisualOutput = format === 'image' || format === 'video';

  function resetCopy(): void {
    setCopyStatus('');
  }

  async function copyShortlist(): Promise<void> {
    try {
      await navigator.clipboard.writeText(
        [
          `AI model shortlist for ${format} — ${priority}`,
          ...shortlist.map(
            (model) =>
              `${model.label} (${model.provider}) — ${model.key}\nCost: ${model.costTier ?? 'not listed'}; speed: ${model.speedTier ?? 'not listed'}; quality: ${model.qualityTier ?? 'not listed'}`,
          ),
          'Catalog matches, not benchmark rankings. https://genfeed.ai/tools/ai-model-selector',
        ].join('\n\n'),
      );
      setCopyStatus('Shortlist copied.');
    } catch {
      setCopyStatus(
        'Could not copy. Select the model names below and copy them manually.',
      );
    }
  }

  return (
    <section
      aria-label="AI model selector"
      className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-12"
    >
      <div className="min-w-0 space-y-6">
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">
            1. What are you creating?
          </legend>
          <div className="flex flex-wrap gap-2">
            {MODEL_FORMATS.map((option) => (
              <Button
                aria-pressed={format === option.value}
                className="min-h-11"
                key={option.value}
                label={option.label}
                onClick={() => {
                  setFormat(option.value);
                  resetCopy();
                }}
                variant={
                  format === option.value
                    ? ButtonVariant.DEFAULT
                    : ButtonVariant.SECONDARY
                }
                withWrapper={false}
              />
            ))}
          </div>
        </fieldset>
        {models ? (
          <Link
            className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4 lg:hidden"
            href="#model-shortlist"
          >
            See your {matches.length} catalog matches &darr;
          </Link>
        ) : null}
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">
            2. What matters most?
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {MODEL_PRIORITIES.map((option) => (
              <Button
                aria-pressed={priority === option.value}
                className="min-h-11"
                key={option.value}
                label={option.label}
                onClick={() => {
                  setPriority(option.value);
                  resetCopy();
                }}
                variant={
                  priority === option.value
                    ? ButtonVariant.DEFAULT
                    : ButtonVariant.SECONDARY
                }
                withWrapper={false}
              />
            ))}
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            Relative catalog tiers, not exact prices or measured performance.
          </p>
        </fieldset>
        {hasVisualOutput ? (
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">
              3. Choose an aspect ratio
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {ORIENTATIONS.map((option) => (
                <Button
                  aria-pressed={orientation === option.value}
                  className="min-h-11"
                  key={option.value}
                  label={option.label}
                  onClick={() => {
                    setOrientation(option.value);
                    resetCopy();
                  }}
                  variant={
                    orientation === option.value
                      ? ButtonVariant.DEFAULT
                      : ButtonVariant.SECONDARY
                  }
                  withWrapper={false}
                />
              ))}
            </div>
          </fieldset>
        ) : null}
        <Field label="Find a model or provider (optional)">
          <Input
            className="min-h-11"
            id="model-search"
            maxLength={100}
            onChange={(event) => {
              setQuery(event.target.value);
              resetCopy();
            }}
            placeholder="Search by name or provider"
            value={query}
          />
        </Field>
        <p className="text-sm leading-6 text-muted-foreground">
          No account, API key, or generation queue. Results update as you
          choose.
        </p>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <h2
            className="scroll-mt-24 text-xl font-semibold"
            id="model-shortlist"
          >
            Your AI model shortlist
          </h2>
          <span aria-live="polite" className="text-sm text-muted-foreground">
            {models
              ? `${matches.length} catalog matches`
              : 'Catalog unavailable'}
          </span>
        </div>
        {models === null ? (
          <div className="space-y-3 py-8" role="status">
            <h3 className="text-lg font-semibold">
              The model catalog could not be reached.
            </h3>
            <p className="text-sm leading-6 text-muted-foreground">
              Reload to try again. We only show models from the product
              registry.
            </p>
            <Button
              asChild
              className="min-h-11"
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            >
              <Link href="/tools/ai-model-selector">Reload catalog</Link>
            </Button>
          </div>
        ) : shortlist.length === 0 ? (
          <div className="space-y-3 py-8" role="status">
            <h3 className="text-lg font-semibold">
              {models.length === 0
                ? 'No models are currently listed.'
                : 'No models match these choices.'}
            </h3>
            <p className="text-sm leading-6 text-muted-foreground">
              Try another format, clear the search, or choose any aspect ratio.
              Specific ratios require recorded support.
            </p>
            <Button
              className="min-h-11"
              label="Reset filters"
              onClick={() => {
                setFormat('image');
                setPriority('default');
                setOrientation('any');
                setQuery('');
                resetCopy();
              }}
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            />
          </div>
        ) : (
          <>
            <ol className="divide-y divide-border">
              {shortlist.map((model, index) => (
                <li className="py-5" key={model.id}>
                  <div className="flex items-start gap-4">
                    <span
                      aria-hidden="true"
                      className="pt-1 text-sm tabular-nums text-muted-foreground"
                    >
                      0{index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="break-words text-lg font-semibold">
                          {model.label}
                        </h3>
                        {model.isDefault ? (
                          <span className="rounded-full bg-secondary px-2 py-1 text-xs text-secondary-foreground">
                            Format default
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 break-words text-sm text-muted-foreground">
                        {model.provider} · {model.category}
                      </p>
                      {model.description ? (
                        <p className="mt-3 text-sm leading-6 text-muted-foreground">
                          {model.description}
                        </p>
                      ) : null}
                      <dl className="mt-4 grid grid-cols-3 gap-3 text-xs">
                        {[
                          ['Cost', model.costTier],
                          ['Speed', model.speedTier],
                          ['Quality', model.qualityTier],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <dt className="text-muted-foreground">{label}</dt>
                            <dd className="mt-1 font-medium capitalize">
                              {value ?? 'Not listed'}
                            </dd>
                          </div>
                        ))}
                      </dl>
                      {hasVisualOutput && orientation !== 'any' ? (
                        <p className="mt-3 text-xs text-muted-foreground">
                          Recorded {orientation} ratios:{' '}
                          {model.aspectRatios
                            .filter((ratio) =>
                              matchesOrientation(ratio, orientation),
                            )
                            .join(', ')}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                className="min-h-11"
                icon={<Copy aria-hidden="true" className="size-4" />}
                label="Copy shortlist"
                onClick={() => void copyShortlist()}
                variant={ButtonVariant.SECONDARY}
                withWrapper={false}
              />
              <p className="text-sm text-muted-foreground" role="status">
                {copyStatus}
              </p>
            </div>
          </>
        )}
        <p className="mt-5 text-sm leading-6 text-muted-foreground">
          Up to three matches, ordered by your priority. When sorting by cost,
          speed, or quality, missing tiers follow recorded ones. The format
          default breaks ties. Availability comes from Genfeed’s public
          registry, refreshed hourly.
        </p>
        <div className="mt-8 space-y-4 border-t border-border pt-6">
          <p className="text-sm leading-6">
            Take your shortlist into Genfeed to create content, review it, and
            publish across your channels.
          </p>
          <ButtonTracked
            asChild
            className="min-h-11 w-full sm:w-auto"
            size={ButtonSize.PUBLIC}
            trackingData={{ action: 'create_content_model_selector' }}
            trackingName="ai_model_selector_cta"
          >
            <a href={`${EnvironmentService.apps.app}/sign-up`}>
              Create content in Genfeed{' '}
              <ArrowRight aria-hidden="true" className="size-4" />
            </a>
          </ButtonTracked>
          <p className="text-xs text-muted-foreground">
            The selector is free. Content generation may use paid credits.
          </p>
        </div>
      </div>
    </section>
  );
}
