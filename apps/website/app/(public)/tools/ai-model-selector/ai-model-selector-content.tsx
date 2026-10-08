'use client';

import {
  MODEL_EXAMPLES,
  MODEL_FORMATS,
  MODEL_PRIORITIES,
  type ModelFormat,
  type ModelOrientation,
  type ModelPriority,
  selectModels,
} from '@data/ai-model-selector';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { AiModelSelectorProps } from '@props/tools/ai-model-selector.props';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { Button } from '@ui/primitives/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import {
  ArrowRight,
  Copy,
  ImageIcon,
  Mic,
  Music2,
  Type,
  Video,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

const ORIENTATIONS = [
  { label: 'Any ratio', value: 'any' },
  { label: 'Portrait', value: 'portrait' },
  { label: 'Landscape', value: 'landscape' },
  { label: 'Square', value: 'square' },
] as const;
const FORMAT_ICONS = {
  image: ImageIcon,
  video: Video,
  text: Type,
  voice: Mic,
  music: Music2,
};

export default function AiModelSelectorContent({
  models,
  benchmark = null,
}: AiModelSelectorProps): React.ReactElement {
  const [format, setFormat] = useState<ModelFormat>('image');
  const [priority, setPriority] = useState<ModelPriority>('default');
  const [orientation, setOrientation] = useState<ModelOrientation>('any');
  const [query, setQuery] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const matches = selectModels(
    models ?? [],
    format,
    priority,
    orientation,
    query,
  );
  const shortlist = matches.slice(0, 3);
  const hasVisualOutput = format === 'image' || format === 'video';
  const FormatIcon = FORMAT_ICONS[format];

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
      setCopyStatus('Could not copy. Select the model names to copy manually.');
    }
  }

  return (
    <section aria-label="AI model selector" className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-2">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Create</legend>
          <div className="flex flex-wrap gap-1">
            {MODEL_FORMATS.map((option) => (
              <Button
                aria-pressed={format === option.value}
                className="min-h-11 px-3"
                key={option.value}
                label={option.label}
                onClick={() => {
                  setFormat(option.value);
                  setCopyStatus('');
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
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Prioritize</legend>
          <div className="flex flex-wrap gap-1">
            {MODEL_PRIORITIES.map((option) => (
              <Button
                aria-pressed={priority === option.value}
                className="min-h-11 px-3"
                key={option.value}
                label={option.label}
                onClick={() => {
                  setPriority(option.value);
                  setCopyStatus('');
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
        </fieldset>
      </div>
      <Collapsible className="border-b border-border">
        <CollapsibleTrigger className="min-h-11">
          More filters
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid gap-4 pb-2 sm:grid-cols-2">
            <Field label="Find a model or provider (optional)">
              <Input
                className="min-h-11"
                id="model-search"
                maxLength={100}
                placeholder="Search models"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setCopyStatus('');
                }}
                value={query}
              />
            </Field>
            {hasVisualOutput ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Aspect ratio</legend>
                <div className="flex flex-wrap gap-2">
                  {ORIENTATIONS.map((option) => (
                    <Button
                      aria-pressed={orientation === option.value}
                      className="min-h-11"
                      key={option.value}
                      label={option.label}
                      onClick={() => {
                        setOrientation(option.value);
                        setCopyStatus('');
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
          </div>
        </CollapsibleContent>
      </Collapsible>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="scroll-mt-24 text-xl font-semibold" id="model-shortlist">
          Your shortlist
        </h2>
        <span aria-live="polite" className="text-sm text-muted-foreground">
          {models ? `${matches.length} matches` : 'Catalog unavailable'}
        </span>
      </div>
      {models === null ? (
        <div className="space-y-3 py-6" role="status">
          <h3 className="font-semibold">
            The model catalog could not be reached.
          </h3>
          <Button asChild variant={ButtonVariant.SECONDARY} withWrapper={false}>
            <Link href="/tools/ai-model-selector">Reload catalog</Link>
          </Button>
        </div>
      ) : shortlist.length === 0 ? (
        <div className="space-y-3 py-6" role="status">
          <h3 className="font-semibold">
            {models.length === 0
              ? 'No models are currently listed.'
              : 'No models match these choices.'}
          </h3>
          <Button
            label="Reset filters"
            onClick={() => {
              setFormat('image');
              setPriority('default');
              setOrientation('any');
              setQuery('');
              setCopyStatus('');
            }}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
          />
        </div>
      ) : (
        <>
          <ol className="grid gap-4 sm:grid-cols-3">
            {shortlist.map((model) => {
              const example = MODEL_EXAMPLES[model.key];
              return (
                <li
                  className="grid min-w-0 grid-cols-[7rem_minmax(0,1fr)] gap-3 sm:block"
                  key={model.id}
                >
                  <div className="relative aspect-square overflow-hidden rounded-lg bg-secondary sm:aspect-[4/3]">
                    {example && !failedImages[model.key] ? (
                      <Image
                        alt={example.alt}
                        className="object-cover"
                        fill
                        loading="lazy"
                        sizes="(min-width: 640px) 33vw, 112px"
                        src={example.src}
                        unoptimized
                        onError={() =>
                          setFailedImages((current) => ({
                            ...current,
                            [model.key]: true,
                          }))
                        }
                      />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                        <FormatIcon aria-hidden="true" className="size-8" />
                        {hasVisualOutput ? (
                          <span className="text-xs">No preview</span>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 sm:pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-words font-semibold">
                        {model.label}
                      </h3>
                      {model.isDefault ? (
                        <span className="text-xs text-muted-foreground">
                          Default
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {model.provider}
                    </p>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      {[
                        ['Cost', model.costTier],
                        ['Speed', model.speedTier],
                        ['Quality', model.qualityTier],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd className="mt-1 capitalize">{value ?? '—'}</dd>
                        </div>
                      ))}
                    </dl>
                    {example ? (
                      <a
                        className="mt-3 inline-flex min-h-11 items-center text-xs underline underline-offset-4"
                        href={example.source}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Replicate example ↗
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap items-center gap-3">
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
      <p className="text-xs text-muted-foreground">
        Catalog tiers, not measured scores. Provider examples use different
        prompts.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 border-y border-border py-3 text-sm">
        <span>
          {benchmark === null
            ? 'Benchmark unavailable'
            : benchmark.season.matchCount === 0
              ? 'Benchmark: no judged matches yet'
              : `${benchmark.season.matchCount} judged ${benchmark.season.medium} matches`}
        </span>
        <Link
          className="inline-flex min-h-11 items-center gap-2 underline underline-offset-4"
          href="/benchmark"
        >
          View benchmark <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-3">
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
        <span className="text-xs text-muted-foreground">
          Generation may use paid credits.
        </span>
      </div>
    </section>
  );
}
