'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import Card from '@ui/card/Card';
import { HStack, VStack } from '@ui/layout/stack';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import { Textarea } from '@ui/primitives/textarea';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import HomeFooter from '@web-components/home/_footer';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  LuArrowRight,
  LuBadgeCheck,
  LuFileText,
  LuLayers,
  LuPalette,
  LuSearchCheck,
  LuTriangleAlert,
} from 'react-icons/lu';

const PREVIEW_MODES = [
  {
    icon: LuFileText,
    key: 'idle',
    label: 'Idle',
    status: 'Waiting for source',
  },
  {
    icon: LuSearchCheck,
    key: 'partial',
    label: 'Partial',
    status: 'Evidence found',
  },
  {
    icon: LuBadgeCheck,
    key: 'ready',
    label: 'Ready',
    status: 'Preview ready',
  },
  {
    icon: LuTriangleAlert,
    key: 'blocked',
    label: 'Blocked',
    status: 'Needs public source',
  },
] as const;

const SOURCE_EVIDENCE = [
  {
    confidence: 'High',
    label: 'Positioning',
    value: 'AI content OS for founders and teams shipping across channels.',
  },
  {
    confidence: 'Medium',
    label: 'Voice',
    value: 'Direct, operational, and anti-fluff. Short nouns beat slogans.',
  },
  {
    confidence: 'Missing',
    label: 'Motion',
    value: 'No public evidence yet. Keep motion rules empty until sourced.',
  },
] as const;

const CONTENT_PILLARS = [
  'Founder proof',
  'Launch systems',
  'Content operations',
  'Model leverage',
] as const;

const PALETTE_CANDIDATES = [
  { hex: '#f4f4f5', label: 'Primary ink', source: 'Current product token' },
  { hex: '#10b981', label: 'Proof green', source: 'Status token' },
  { hex: '#f59e0b', label: 'Missing amber', source: 'Diagnostic token' },
  { hex: '#3b82f6', label: 'Evidence blue', source: 'Status token' },
] as const;

const SCALE_ROLES = [
  {
    description: 'Dense controls, tables, source rows, and review fields.',
    label: 'Product',
    value: '32px control baseline',
  },
  {
    description: 'CTA modules and preview panels that need public scanning.',
    label: 'Block',
    value: '1x campaign unit',
  },
  {
    description: 'Primary Brand OS promise, public proof, and conversion copy.',
    label: 'Hero',
    value: '1.618x block',
  },
  {
    description: 'Single launch artifact or proof object. Use once per page.',
    label: 'Monument',
    value: '2.618x block',
  },
] as const;

type PreviewModeKey = (typeof PREVIEW_MODES)[number]['key'];

function getSourceName(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return 'No public URL yet';
  }

  try {
    const url = new URL(
      trimmed.startsWith('http') ? trimmed : `https://${trimmed}`,
    );
    return url.hostname.replace(/^www\./, '');
  } catch {
    return 'Manual source';
  }
}

export default function BrandOSContent(): React.ReactElement {
  const containerRef = useMarketingEntrance({ cards: false });
  const signUpHref = `${EnvironmentService.apps.app}/sign-up?source=brand-os`;
  const [websiteUrl, setWebsiteUrl] = useState('genfeed.ai');
  const [guidance, setGuidance] = useState(
    'Keep the brand system operational: cite evidence, mark assumptions, and never copy a competitor kit.',
  );
  const [previewMode, setPreviewMode] = useState<PreviewModeKey>('partial');

  const sourceName = useMemo(() => getSourceName(websiteUrl), [websiteUrl]);
  const hasGuidance = guidance.trim().length > 0;
  const activeMode = PREVIEW_MODES.find((mode) => mode.key === previewMode);
  const previewStatus = activeMode?.status ?? 'Preview ready';

  return (
    <div ref={containerRef}>
      <main>
        <section className="border-b border-edge/5 bg-background py-14 sm:py-16 lg:py-20">
          <div className="container mx-auto px-6">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:items-start">
              <VStack className="gap-8">
                <VStack className="gap-5">
                  <HStack className="w-fit items-center gap-2 border border-edge/10 bg-fill/[0.02] px-3 py-1.5 text-[10px] font-black uppercase text-surface/45">
                    <LuLayers className="size-3.5" />
                    <Text>Brand OS</Text>
                  </HStack>

                  <Heading
                    as="h1"
                    className="max-w-3xl text-5xl font-serif leading-none text-surface sm:text-6xl lg:text-7xl"
                  >
                    Turn source evidence into a usable brand system.
                  </Heading>

                  <Text className="max-w-2xl text-base leading-7 text-surface/55 sm:text-lg">
                    The Brand OS surface separates evidence, assumptions,
                    missing fields, scale roles, and save actions before it
                    enters a brand workspace.
                  </Text>
                </VStack>

                <form
                  className="grid gap-5 border border-edge/5 bg-fill/[0.02] p-5 sm:p-6"
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    const raw = websiteUrl.trim();
                    const normalized =
                      raw && !raw.startsWith('http') ? `https://${raw}` : raw;
                    if (normalized !== websiteUrl) {
                      setWebsiteUrl(normalized);
                    }
                    setPreviewMode(hasGuidance ? 'ready' : 'partial');
                  }}
                >
                  <Input
                    aria-describedby="brand-os-url-help"
                    label="Public website URL"
                    onChange={(event) => setWebsiteUrl(event.target.value)}
                    placeholder="https://example.com"
                    type="text"
                    value={websiteUrl}
                  />
                  <Text
                    as="p"
                    className="text-xs leading-5 text-surface/35"
                    id="brand-os-url-help"
                  >
                    Private, loopback, and authenticated URLs stay blocked by
                    the eventual extraction service.
                  </Text>

                  <div className="space-y-1.5">
                    <Label
                      className="text-sm font-medium text-foreground"
                      htmlFor="brand-os-guidance"
                    >
                      Manual guidance
                    </Label>
                    <Textarea
                      id="brand-os-guidance"
                      maxHeight={180}
                      onChange={(event) => setGuidance(event.target.value)}
                      placeholder="Voice, audience, product, proof, or launch notes"
                      rows={4}
                      value={guidance}
                    />
                  </div>

                  <div className="grid gap-2 sm:grid-cols-4">
                    {PREVIEW_MODES.map((mode) => {
                      const Icon = mode.icon;
                      const isActive = previewMode === mode.key;

                      return (
                        <Button
                          className="justify-center gap-2"
                          key={mode.key}
                          onClick={() => setPreviewMode(mode.key)}
                          size={ButtonSize.SM}
                          type="button"
                          variant={
                            isActive
                              ? ButtonVariant.SECONDARY
                              : ButtonVariant.GHOST
                          }
                        >
                          <Icon className="size-4" />
                          {mode.label}
                        </Button>
                      );
                    })}
                  </div>

                  <div
                    aria-live="polite"
                    className="border border-edge/5 bg-background px-4 py-3 text-sm text-surface/55"
                  >
                    {previewStatus}: {sourceName}
                  </div>

                  <HStack className="flex-wrap gap-3">
                    <Button type="submit" size={ButtonSize.PUBLIC}>
                      Refresh Preview
                    </Button>
                    <ButtonTracked
                      asChild
                      size={ButtonSize.PUBLIC}
                      trackingData={{ action: 'save_brand_os_preview' }}
                      trackingName="brand_os_cta_click"
                      variant={ButtonVariant.OUTLINE}
                    >
                      <a
                        href={signUpHref}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        Save in Genfeed
                        <LuArrowRight className="size-4" />
                      </a>
                    </ButtonTracked>
                  </HStack>
                </form>
              </VStack>

              <Card
                className="border border-edge/5 bg-fill/[0.02] shadow-none hover:shadow-none"
                bodyClassName="gap-0 p-0"
                data-testid="brand-os-preview"
              >
                <div className="grid border-b border-edge/5 md:grid-cols-[0.9fr_1.1fr]">
                  <div className="relative min-h-64 overflow-hidden border-b border-edge/5 md:border-b-0 md:border-r">
                    <Image
                      alt="Color and layout reference board"
                      className="object-cover"
                      fill
                      priority
                      sizes="(max-width: 768px) 100vw, 42vw"
                      src="https://images.unsplash.com/photo-1518005020951-eccb494ad742?w=1000&q=80&fit=crop"
                    />
                    <div className="absolute inset-0 bg-black/45" />
                    <div className="absolute inset-x-0 bottom-0 p-5">
                      <Text className="text-[10px] font-black uppercase text-white/55">
                        Preview source
                      </Text>
                      <Heading as="h2" className="mt-2 text-3xl text-white">
                        {sourceName}
                      </Heading>
                    </div>
                  </div>

                  <VStack className="gap-5 p-5 sm:p-6">
                    <HStack className="items-center justify-between gap-4">
                      <Text className="text-[10px] font-black uppercase text-surface/35">
                        {previewStatus}
                      </Text>
                      <span className="text-[10px] font-black uppercase text-success">
                        Source backed
                      </span>
                    </HStack>

                    <VStack className="gap-3">
                      {SOURCE_EVIDENCE.map((item) => (
                        <div
                          className="grid gap-2 border-t border-edge/5 pt-3 sm:grid-cols-[0.55fr_1fr]"
                          key={item.label}
                        >
                          <VStack className="gap-1">
                            <Text className="text-xs font-semibold text-surface">
                              {item.label}
                            </Text>
                            <Text className="text-[10px] font-black uppercase text-surface/30">
                              {item.confidence}
                            </Text>
                          </VStack>
                          <Text className="text-sm leading-6 text-surface/60">
                            {item.value}
                          </Text>
                        </div>
                      ))}
                    </VStack>
                  </VStack>
                </div>

                <div className="grid gap-px bg-edge/5 lg:grid-cols-3">
                  <VStack className="gap-4 bg-background p-5">
                    <Text className="text-[10px] font-black uppercase text-surface/30">
                      Palette candidates
                    </Text>
                    <div className="grid grid-cols-2 gap-3">
                      {PALETTE_CANDIDATES.map((color) => (
                        <VStack className="gap-2" key={color.label}>
                          <span
                            aria-label={`${color.label} ${color.hex}`}
                            className="block h-12 border border-edge/10"
                            role="img"
                            style={{ backgroundColor: color.hex }}
                          />
                          <VStack className="gap-0.5">
                            <Text className="text-xs font-semibold text-surface">
                              {color.label}
                            </Text>
                            <Text className="text-[10px] text-surface/35">
                              {color.source}
                            </Text>
                          </VStack>
                        </VStack>
                      ))}
                    </div>
                  </VStack>

                  <VStack className="gap-4 bg-background p-5">
                    <Text className="text-[10px] font-black uppercase text-surface/30">
                      Content pillars
                    </Text>
                    <ul className="space-y-3">
                      {CONTENT_PILLARS.map((pillar) => (
                        <li
                          className="flex items-center gap-3 border-b border-edge/5 pb-3 text-sm text-surface/65 last:border-b-0 last:pb-0"
                          key={pillar}
                        >
                          <LuBadgeCheck className="size-4 shrink-0 text-success" />
                          {pillar}
                        </li>
                      ))}
                    </ul>
                  </VStack>

                  <VStack className="gap-4 bg-background p-5">
                    <Text className="text-[10px] font-black uppercase text-surface/30">
                      Diagnostics
                    </Text>
                    <Text className="text-sm leading-6 text-surface/60">
                      {previewMode === 'blocked'
                        ? 'The preview blocks private or unreachable sources and keeps the save action unavailable until public evidence exists.'
                        : 'The preview keeps low-confidence fields visible, preserves missing evidence, and carries source notes into the save prompt.'}
                    </Text>
                    <Text className="text-sm leading-6 text-surface/60">
                      {hasGuidance
                        ? guidance
                        : 'Manual guidance is empty, so the saved draft would ask for voice and positioning before apply.'}
                    </Text>
                  </VStack>
                </div>
              </Card>
            </div>
          </div>
        </section>

        <section
          className="border-b border-edge/5 bg-fill/[0.02] py-20"
          id="brand-os-rules"
        >
          <div className="container mx-auto px-6">
            <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.72fr_1.28fr]">
              <VStack className="gap-4">
                <HStack className="items-center gap-2 text-[10px] font-black uppercase text-surface/35">
                  <LuPalette className="size-4" />
                  <Text>Design contract</Text>
                </HStack>
                <Heading as="h2" className="text-4xl font-serif text-surface">
                  Source-backed, not style-matched.
                </Heading>
                <Text className="text-base leading-7 text-surface/55">
                  Brand OS output labels every recommendation as extracted,
                  inferred, missing, or candidate. Product screens stay compact;
                  public campaign objects can scale up when they carry proof.
                </Text>
              </VStack>

              <div className="grid gap-px bg-edge/5 sm:grid-cols-2">
                {SCALE_ROLES.map((role) => (
                  <VStack className="gap-4 bg-background p-5" key={role.label}>
                    <HStack className="items-center justify-between gap-4">
                      <Text className="text-lg font-semibold text-surface">
                        {role.label}
                      </Text>
                      <Text className="text-[10px] font-black uppercase text-surface/35">
                        {role.value}
                      </Text>
                    </HStack>
                    <Text className="text-sm leading-6 text-surface/55">
                      {role.description}
                    </Text>
                  </VStack>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-3">
              {[
                'Current Genfeed tokens remain the product palette until a source-backed palette is accepted.',
                'Candidate Wada/Sanzo-inspired color outputs are labeled as candidates, never product defaults.',
                'Authenticated review screens use dense controls, evidence rows, and explicit apply/discard states.',
              ].map((rule) => (
                <Card
                  className="border border-edge/5 bg-fill/[0.02] shadow-none hover:shadow-none"
                  bodyClassName="p-5"
                  key={rule}
                >
                  <Text className="text-sm leading-6 text-surface/60">
                    {rule}
                  </Text>
                </Card>
              ))}
            </div>

            <HStack className="mt-10 flex-wrap justify-center gap-3">
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                trackingData={{ action: 'brand_os_signup_bottom' }}
                trackingName="brand_os_cta_click"
              >
                <a href={signUpHref} rel="noopener noreferrer" target="_blank">
                  Save a Brand OS
                  <LuArrowRight className="size-4" />
                </a>
              </ButtonTracked>
              <Button
                asChild
                size={ButtonSize.PUBLIC}
                variant={ButtonVariant.OUTLINE}
              >
                <Link href="/">Back to Genfeed.ai</Link>
              </Button>
            </HStack>
          </div>
        </section>
      </main>
      <HomeFooter />
    </div>
  );
}
