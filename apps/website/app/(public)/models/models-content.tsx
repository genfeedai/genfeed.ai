'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import type { PublicModelCatalogItem } from '@public/models/models-loader';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import PageLayout from '@web-components/PageLayout';
import { ArrowRight, RefreshCw } from 'lucide-react';
import Link from 'next/link';

interface ModelsContentProps {
  models: PublicModelCatalogItem[] | null;
}

const CATEGORY_ORDER = [
  'video',
  'video-edit',
  'video-upscale',
  'image',
  'image-edit',
  'image-upscale',
  'voice',
  'music',
  'text',
  'embedding',
];

function titleCase(value: string): string {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function groupModels(models: PublicModelCatalogItem[]) {
  const groups = new Map<string, PublicModelCatalogItem[]>();

  for (const model of models) {
    const group = groups.get(model.category) ?? [];
    group.push(model);
    groups.set(model.category, group);
  }

  return [...groups.entries()].sort(([left], [right]) => {
    const leftIndex = CATEGORY_ORDER.indexOf(left);
    const rightIndex = CATEGORY_ORDER.indexOf(right);

    if (leftIndex === -1 && rightIndex === -1) {
      return left.localeCompare(right);
    }
    if (leftIndex === -1) {
      return 1;
    }
    if (rightIndex === -1) {
      return -1;
    }
    return leftIndex - rightIndex;
  });
}

function CatalogSignal({ models }: ModelsContentProps) {
  const modelCount = models?.length ?? 0;
  const categoryCount = new Set(models?.map((model) => model.category)).size;
  const providerCount = new Set(models?.map((model) => model.provider)).size;

  return (
    <div className="w-full max-w-xl border-l border-edge/10 pl-7 sm:pl-10">
      <Text className="text-xs font-bold uppercase tracking-[0.16em] text-surface/55">
        Live catalog
      </Text>
      {models && models.length > 0 ? (
        <div className="mt-6 grid grid-cols-3 gap-5">
          {[
            { label: 'Models', value: modelCount },
            { label: 'Formats', value: categoryCount },
            { label: 'Providers', value: providerCount },
          ].map((item) => (
            <div key={item.label}>
              <Text className="text-4xl font-semibold tracking-[-0.05em] text-surface sm:text-5xl">
                {item.value}
              </Text>
              <Text className="mt-2 text-xs uppercase tracking-[0.12em] text-surface/50">
                {item.label}
              </Text>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 flex items-center gap-3 text-surface/65">
          <RefreshCw className="size-5" />
          <Text>
            {models
              ? 'No public models are currently listed'
              : 'Catalog connection unavailable'}
          </Text>
        </div>
      )}
      <Text className="mt-7 max-w-md text-sm leading-6 text-surface/60">
        Read from the same public registry as the app and refreshed hourly.
      </Text>
    </div>
  );
}

export default function ModelsContent({ models }: ModelsContentProps) {
  const containerRef = useMarketingEntrance();
  const groups = models ? groupModels(models) : [];

  return (
    <div ref={containerRef}>
      <PageLayout
        compact
        description="The models available in Genfeed, read directly from the product registry."
        heroActions={
          <>
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'start_creating_models' }}
              trackingName="models_hero_click"
            >
              <a href={`${EnvironmentService.apps.app}/sign-up`}>
                Start creating
                <ArrowRight className="size-4" />
              </a>
            </ButtonTracked>
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'explore_studio_models' }}
              trackingName="models_hero_click"
              variant={ButtonVariant.SECONDARY}
            >
              <Link href="/studio">Explore Studio</Link>
            </ButtonTracked>
          </>
        }
        heroVisual={<CatalogSignal models={models} />}
        title="Models"
      >
        {models === null ? (
          <section className="container mx-auto px-6 pb-32">
            <div className="max-w-3xl border-y border-edge/10 py-16">
              <Text className="text-xs font-bold uppercase tracking-[0.16em] text-surface/55">
                Catalog unavailable
              </Text>
              <Heading
                as="h2"
                className="mt-5 text-4xl font-semibold tracking-[-0.04em] text-surface"
              >
                The registry could not be reached.
              </Heading>
              <Text className="mt-5 max-w-xl text-base leading-7 text-surface/65">
                This page never substitutes a hardcoded list. Try again when the
                public catalog connection is restored.
              </Text>
            </div>
          </section>
        ) : models.length === 0 ? (
          <section className="container mx-auto px-6 pb-32">
            <div className="max-w-3xl border-y border-edge/10 py-16">
              <Text className="text-xs font-bold uppercase tracking-[0.16em] text-surface/55">
                Catalog empty
              </Text>
              <Heading
                as="h2"
                className="mt-5 text-4xl font-semibold tracking-[-0.04em] text-surface"
              >
                No public models are listed yet.
              </Heading>
              <Text className="mt-5 max-w-xl text-base leading-7 text-surface/65">
                The page is connected to the registry and will populate when a
                model is published for public use.
              </Text>
            </div>
          </section>
        ) : (
          <div className="container mx-auto px-6 pb-32">
            <div className="mb-20 flex flex-col justify-between gap-6 border-b border-edge/10 pb-10 sm:flex-row sm:items-end">
              <div>
                <Text className="text-xs font-bold uppercase tracking-[0.16em] text-surface/55">
                  Current availability
                </Text>
                <Heading
                  as="h2"
                  className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-surface sm:text-5xl"
                >
                  Choose by output.
                </Heading>
              </div>
              <Text className="max-w-md text-sm leading-6 text-surface/60">
                Availability, defaults, and capabilities update from the
                registry. Nothing on this page is maintained by hand.
              </Text>
            </div>

            <div className="space-y-24">
              {groups.map(([category, categoryModels], groupIndex) => (
                <section
                  className="gsap-section grid gap-10 lg:grid-cols-[minmax(12rem,0.35fr)_minmax(0,1fr)] lg:gap-20"
                  key={category}
                >
                  <div>
                    <Text className="text-xs font-bold uppercase tracking-[0.16em] text-surface/45">
                      {String(groupIndex + 1).padStart(2, '0')}
                    </Text>
                    <Heading
                      as="h2"
                      className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-surface"
                    >
                      {titleCase(category)}
                    </Heading>
                    <Text className="mt-3 text-sm text-surface/55">
                      {categoryModels.length}{' '}
                      {categoryModels.length === 1 ? 'model' : 'models'}
                    </Text>
                  </div>

                  <ol className="border-t border-edge/10">
                    {categoryModels.map((model, index) => (
                      <li
                        className="grid gap-5 border-b border-edge/10 py-7 sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:py-8"
                        key={model.id}
                      >
                        <Text className="text-xs font-bold tracking-[0.12em] text-surface/40">
                          {String(index + 1).padStart(2, '0')}
                        </Text>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Heading
                              as="h3"
                              className="text-xl font-semibold tracking-[-0.025em] text-surface"
                            >
                              {model.label}
                            </Heading>
                            {model.isDefault ? (
                              <span className="rounded-full border border-edge/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-surface/55">
                                Default
                              </span>
                            ) : null}
                          </div>
                          {model.description ? (
                            <Text className="mt-3 max-w-2xl text-sm leading-6 text-surface/62">
                              {model.description}
                            </Text>
                          ) : null}
                          {model.capabilities.length > 0 ? (
                            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
                              {model.capabilities
                                .slice(0, 4)
                                .map((capability) => (
                                  <Text
                                    className="text-[11px] uppercase tracking-[0.1em] text-surface/45"
                                    key={capability}
                                  >
                                    {titleCase(capability)}
                                  </Text>
                                ))}
                            </div>
                          ) : null}
                        </div>
                        <Text className="text-xs font-bold uppercase tracking-[0.12em] text-surface/50 sm:pt-1">
                          {titleCase(model.provider)}
                        </Text>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          </div>
        )}
      </PageLayout>
    </div>
  );
}
