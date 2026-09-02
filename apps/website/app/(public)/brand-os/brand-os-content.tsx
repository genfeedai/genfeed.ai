'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import { EnvironmentService } from '@services/core/environment.service';
import { Button } from '@ui/primitives/button';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import HomeFooter from '@web-components/home/_footer';
import { Layers } from 'lucide-react';
import Link from 'next/link';
import { BrandOsFunnel } from './brand-os-funnel';
import {
  BrandOSPreviewAction,
  BrandOSPreviewStateCatalog,
} from './brand-os-preview-state';

interface Swatch {
  hex: string;
  name: string;
  role: string;
}

interface ScaleRow {
  element: string;
  size: string;
}

interface RadiusStep {
  name: string;
  px: number;
  use: string;
}

interface ColorDoor {
  body: string;
  index: string;
  title: string;
}

const BACKGROUND_LAYERS: Swatch[] = [
  { hex: '#0A0A0A', name: 'bg-primary', role: 'Main canvas, sidebar' },
  { hex: '#161616', name: 'bg-secondary', role: 'Cards, panels' },
  { hex: '#1F1F1F', name: 'bg-tertiary', role: 'Inputs, nested surfaces' },
  {
    hex: '#161616',
    name: 'bg-elevated',
    role: 'Popovers, dropdowns — separated by hairline + shadow, not lightness',
  },
  { hex: '#2A2A2A', name: 'bg-hover', role: 'Interactive hover states' },
];

const TEXT_TIERS: Swatch[] = [
  { hex: '#EDEDED', name: 'text-primary', role: 'Primary content — 16.9:1' },
  { hex: '#A1A1A1', name: 'text-secondary', role: 'Secondary labels — 7.7:1' },
  { hex: '#949494', name: 'text-muted', role: 'Muted / metadata — 6.5:1' },
];

const ACCENT: Swatch[] = [
  { hex: '#EDEDED', name: 'accent', role: 'Primary CTA on dark' },
  { hex: '#0A0A0A', name: 'accent-foreground', role: 'Text on accent' },
  { hex: '#CCCCCC', name: 'accent-hover', role: 'CTA hover' },
];

const SEMANTIC: Swatch[] = [
  { hex: '#10B981', name: 'Success', role: 'Completed, passing, published' },
  {
    hex: '#F59E0B',
    name: 'Warning',
    role: 'Needs attention, awaiting approval',
  },
  { hex: '#FF6166', name: 'Danger', role: 'Failed, errored, rejected' },
  { hex: '#52A8FF', name: 'Info', role: 'Informational, neutral status' },
];

const DOMAIN: Swatch[] = [
  { hex: '#38BDF8', name: 'Agent', role: 'AI agent activity states' },
  { hex: '#C084FC', name: 'Done', role: 'Completed workflows' },
];

const PLATFORMS: { hex: string; name: string }[] = [
  { hex: '#FCD34D', name: 'Beehiiv' },
  { hex: '#0A0A0A', name: 'DEV Community' },
  { hex: '#5865F2', name: 'Discord' },
  { hex: '#1877F2', name: 'Facebook' },
  { hex: '#6C63FF', name: 'Fanvue' },
  { hex: '#15171A', name: 'Ghost' },
  { hex: '#FF6600', name: 'Hacker News' },
  { hex: '#E1306C', name: 'Instagram' },
  { hex: '#0A66C2', name: 'LinkedIn' },
  { hex: '#6364FF', name: 'Mastodon' },
  { hex: '#00AB6C', name: 'Medium' },
  { hex: '#000000', name: 'Notion' },
  { hex: '#E60023', name: 'Pinterest' },
  { hex: '#DA552F', name: 'Product Hunt' },
  { hex: '#FF4500', name: 'Reddit' },
  { hex: '#96BF48', name: 'Shopify' },
  { hex: '#4A154B', name: 'Slack' },
  { hex: '#FFFC00', name: 'Snapchat' },
  { hex: '#FF6719', name: 'Substack' },
  { hex: '#26A5E4', name: 'Telegram' },
  { hex: '#000000', name: 'Threads' },
  { hex: '#FE2C55', name: 'TikTok' },
  { hex: '#9146FF', name: 'Twitch' },
  { hex: '#25D366', name: 'WhatsApp' },
  { hex: '#21759B', name: 'WordPress' },
  { hex: '#1DA1F2', name: 'X (Twitter)' },
  { hex: '#FF0000', name: 'YouTube' },
];

const TYPE_SCALE: ScaleRow[] = [
  { element: 'Caption / chip', size: '11px' },
  { element: 'Label / table head', size: '12px' },
  { element: 'Body / button / table cell', size: '14px' },
  { element: 'Lede', size: '15px' },
  { element: 'Card title', size: '18px' },
];

const RADIUS_STEPS: RadiusStep[] = [
  { name: 'xs', px: 2, use: 'Tag dots, inline chips' },
  { name: 'sm', px: 4, use: 'Badges, tags' },
  { name: 'md', px: 6, use: 'Buttons, inputs, tooltips' },
  { name: 'lg', px: 8, use: 'Popovers, toasts, overlay panels' },
  { name: 'xl', px: 10, use: 'Dialogs, command palette' },
];

const COLOR_DOORS: ColorDoor[] = [
  {
    body: 'Generated media is the primary color source. Rendered borderless and full-bleed wherever possible, so chrome recedes behind it.',
    index: '01',
    title: 'User content',
  },
  {
    body: 'Platform brand tokens, scoped to badges and icons only. Never layout chrome or primary actions.',
    index: '02',
    title: 'Platform identifiers',
  },
  {
    body: 'Success, warning, danger, info. Applied to state, never decoration.',
    index: '03',
    title: 'Semantic status',
  },
  {
    body: 'Workflow-node and tag colors, for identification and function. Never chrome.',
    index: '04',
    title: 'Categorical palettes',
  },
];

const DOS: string[] = [
  'Use background layering for hierarchy; a hairline confirms the edge, it does not carry it.',
  'Give every raised surface a hairline: shadow-border on cards, shadow-dropdown on overlays.',
  'Move one step for hover, two for selected — never jump to an absolute color.',
  'Use ghost buttons for toolbar and topbar actions.',
  'Apply semantic status colors consistently across every surface.',
  'Use −0.011em letter-spacing on body, −0.02em on headings.',
];

const DONTS: string[] = [
  'Paint pure #FFF on pure #000; capped ends (#EDEDED on #0A0A0A) read better at UI sizes.',
  'Mix hardcoded colors with token references.',
  'Use the accent for status; it is for primary CTAs only.',
  'Add a new semantic color without updating DESIGN.md.',
  'Use large decorative gradients as core product surfaces.',
  'Nest cards inside cards, or add glow / spotlight shadows to chrome.',
];

function SectionLabel({ children }: { children: string }): React.ReactElement {
  return (
    <Text className="text-2xs font-black uppercase tracking-[0.2em] text-surface/55">
      {children}
    </Text>
  );
}

function SwatchTile({ swatch }: { swatch: Swatch }): React.ReactElement {
  return (
    <div className="flex flex-col gap-2">
      <span
        aria-label={`${swatch.name} ${swatch.hex}`}
        className="block h-16 border border-edge/10"
        role="img"
        style={{ backgroundColor: swatch.hex }}
      />
      <div className="flex flex-col gap-0.5">
        <div className="flex flex-row items-center justify-between gap-2">
          <Text className="text-xs font-semibold text-surface">
            {swatch.name}
          </Text>
          <Text className="font-mono text-2xs uppercase text-surface/55">
            {swatch.hex}
          </Text>
        </div>
        <Text className="text-2xs leading-4 text-surface/60">
          {swatch.role}
        </Text>
      </div>
    </div>
  );
}

export default function BrandOSContent(): React.ReactElement {
  const containerRef = useMarketingEntrance({ cards: false });
  const appHref = EnvironmentService.apps.app;

  return (
    <div ref={containerRef}>
      <main>
        {/* Hero */}
        <section className="border-b border-edge/5 bg-background py-16 sm:py-20 lg:py-24">
          <div className="container mx-auto px-6">
            <div className="flex flex-col max-w-4xl gap-6">
              <div className="flex flex-row w-fit items-center gap-2 border border-edge/10 bg-fill/[0.02] px-3 py-1.5 text-2xs font-black uppercase tracking-[0.15em] text-surface/45">
                <Layers className="size-3.5" />
                <Text>Brand OS</Text>
                <span className="text-surface/45">/</span>
                <Text className="text-surface/55">version alpha</Text>
              </div>

              <Heading
                as="h1"
                className="max-w-3xl font-semibold tracking-[-0.02em] text-5xl leading-none text-surface sm:text-6xl lg:text-7xl"
              >
                Turn your website into an AI-readable Brand OS.
              </Heading>

              <Text className="max-w-2xl text-base leading-7 text-surface/55 sm:text-lg">
                Build a reviewable system for voice, visual direction, content
                pillars, and generation rules. Every recommendation shows its
                source, confidence, and gaps before anything reaches your brand
                workspace.
              </Text>

              <BrandOSPreviewAction />
            </div>
          </div>
        </section>

        {/* Source-backed preview — one monument-scale campaign object. */}
        <section
          className="border-b border-edge/5 bg-fill/[0.02] py-16 sm:py-20 lg:py-24"
          id="brand-os-preview"
        >
          <div className="container mx-auto px-6">
            <div className="mx-auto flex max-w-6xl flex-col gap-8">
              <div className="grid gap-4 lg:grid-cols-[0.7fr_1fr] lg:items-end">
                <div className="flex flex-col gap-3">
                  <SectionLabel>Source-backed preview</SectionLabel>
                  <Heading
                    as="h2"
                    className="max-w-xl text-4xl font-semibold tracking-[-0.02em] text-surface sm:text-5xl"
                  >
                    Strategy with receipts.
                  </Heading>
                </div>
                <Text className="max-w-2xl text-sm leading-6 text-surface/60 lg:justify-self-end">
                  Extracted evidence is not an assumption. Inferred direction is
                  not a fact. Candidate palettes remain exploration, and missing
                  proof stays missing until a source closes the gap.
                </Text>
              </div>

              <BrandOsFunnel />
            </div>
          </div>
        </section>

        {/* The catalog documents every explicit state used by the live funnel. */}
        <section
          className="border-b border-edge/5 py-16 sm:py-20"
          id="brand-os-states"
        >
          <div className="container mx-auto px-6">
            <div className="mx-auto flex max-w-6xl flex-col gap-8">
              <div className="grid gap-4 lg:grid-cols-[0.7fr_1fr] lg:items-end">
                <div className="flex flex-col gap-3">
                  <SectionLabel>State contract</SectionLabel>
                  <Heading
                    as="h2"
                    className="max-w-xl text-4xl font-semibold tracking-[-0.02em] text-surface"
                  >
                    No silent state changes.
                  </Heading>
                </div>
                <Text className="max-w-2xl text-sm leading-6 text-surface/60 lg:justify-self-end">
                  The public preview names progress, partial evidence, recovery,
                  conversion, and review outcomes. The live preview above uses
                  the same state contract before authenticated review.
                </Text>
              </div>

              <BrandOSPreviewStateCatalog />
            </div>
          </div>
        </section>

        {/* Color: backgrounds + text */}
        <section className="border-b border-edge/5 bg-fill/[0.02] py-16 sm:py-20">
          <div className="container mx-auto grid gap-12 px-6 lg:grid-cols-[0.32fr_1fr] lg:gap-16">
            <div className="flex flex-col gap-4">
              <SectionLabel>Foundations</SectionLabel>
              <Heading
                as="h2"
                className="font-semibold tracking-[-0.02em] text-4xl text-surface"
              >
                Depth without borders.
              </Heading>
              <Text className="text-sm leading-6 text-surface/55">
                Five background tones create elevation from the deepest canvas
                to the most raised surface, with no heavy strokes, just tonal
                shift. Text resolves in three tiers over the top.
              </Text>
            </div>

            <div className="flex flex-col gap-10">
              <div className="flex flex-col gap-4">
                <SectionLabel>Background layers</SectionLabel>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                  {BACKGROUND_LAYERS.map((swatch) => (
                    <SwatchTile key={swatch.name} swatch={swatch} />
                  ))}
                </div>
              </div>

              <div className="grid gap-10 sm:grid-cols-2">
                <div className="flex flex-col gap-4">
                  <SectionLabel>Text hierarchy</SectionLabel>
                  <div className="grid grid-cols-3 gap-4">
                    {TEXT_TIERS.map((swatch) => (
                      <SwatchTile key={swatch.name} swatch={swatch} />
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                  <SectionLabel>Accent, inverted for dark</SectionLabel>
                  <div className="grid grid-cols-3 gap-4">
                    {ACCENT.map((swatch) => (
                      <SwatchTile key={swatch.name} swatch={swatch} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Semantic + domain */}
        <section className="border-b border-edge/5 py-16 sm:py-20">
          <div className="container mx-auto grid gap-12 px-6 lg:grid-cols-[0.32fr_1fr] lg:gap-16">
            <div className="flex flex-col gap-4">
              <SectionLabel>Signal</SectionLabel>
              <Heading
                as="h2"
                className="font-semibold tracking-[-0.02em] text-4xl text-surface"
              >
                Color that means something.
              </Heading>
              <Text className="text-sm leading-6 text-surface/55">
                Status and domain colors map directly to state and workflow,
                never decoration. Four semantic tones, two domain tones.
              </Text>
            </div>

            <div className="flex flex-col gap-10">
              <div className="flex flex-col gap-4">
                <SectionLabel>Semantic status</SectionLabel>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {SEMANTIC.map((swatch) => (
                    <SwatchTile key={swatch.name} swatch={swatch} />
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-4">
                <SectionLabel>Domain</SectionLabel>
                <div className="grid grid-cols-2 gap-4 sm:max-w-md">
                  {DOMAIN.map((swatch) => (
                    <SwatchTile key={swatch.name} swatch={swatch} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Platform identifiers */}
        <section className="border-b border-edge/5 bg-fill/[0.02] py-16 sm:py-20">
          <div className="container mx-auto grid gap-12 px-6 lg:grid-cols-[0.32fr_1fr] lg:gap-16">
            <div className="flex flex-col gap-4">
              <SectionLabel>Identifiers</SectionLabel>
              <Heading
                as="h2"
                className="font-semibold tracking-[-0.02em] text-4xl text-surface"
              >
                Platform tokens.
              </Heading>
              <Text className="text-sm leading-6 text-surface/55">
                Twenty-four brand colors used as identifiers only, on platform
                icons, connection badges, and analytics breakdowns. Never for
                layout chrome or primary actions.
              </Text>
            </div>

            <div className="grid grid-cols-3 gap-x-4 gap-y-5 sm:grid-cols-4 lg:grid-cols-6">
              {PLATFORMS.map((platform) => (
                <div
                  className="flex flex-row items-center gap-2.5"
                  key={platform.name}
                >
                  <span
                    aria-hidden
                    className="size-6 shrink-0 rounded-sm border border-edge/10"
                    style={{ backgroundColor: platform.hex }}
                  />
                  <div className="flex flex-col gap-0">
                    <Text className="text-xs font-medium text-surface/80">
                      {platform.name}
                    </Text>
                    <Text className="font-mono text-2xs uppercase text-surface/55">
                      {platform.hex}
                    </Text>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Typography + radius */}
        <section className="border-b border-edge/5 py-16 sm:py-20">
          <div className="container mx-auto grid gap-12 px-6 lg:grid-cols-2 lg:gap-16">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <SectionLabel>Typography</SectionLabel>
                <Heading
                  as="h2"
                  className="font-semibold tracking-[-0.02em] text-4xl text-surface"
                >
                  A dense, deliberate scale.
                </Heading>
                <Text className="text-sm leading-6 text-surface/55">
                  System sans for the interface, mono for code and tokens. Body
                  sits at 13px with −0.01em tracking; headings tighten to
                  −0.03em.
                </Text>
              </div>
              <div className="gen-card-spotlight">
                {TYPE_SCALE.map((row) => (
                  <div
                    className="flex flex-row items-center justify-between gap-4 border-b border-edge/5 px-5 py-3.5 last:border-b-0"
                    key={row.element}
                  >
                    <Text className="text-sm text-surface/70">
                      {row.element}
                    </Text>
                    <Text className="font-mono text-2xs uppercase text-surface/60">
                      {row.size}
                    </Text>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <SectionLabel>Form</SectionLabel>
                <Heading
                  as="h2"
                  className="font-semibold tracking-[-0.02em] text-4xl text-surface"
                >
                  Four-step radius.
                </Heading>
                <Text className="text-sm leading-6 text-surface/55">
                  Corners map to purpose, matching the ShipCode and Linear
                  language. Elevated surfaces use inset box-shadow for
                  containment instead of a CSS border.
                </Text>
              </div>
              <div className="grid gap-px bg-edge/5 sm:grid-cols-2">
                {RADIUS_STEPS.map((step) => (
                  <div
                    className="flex flex-col gap-3 bg-background p-5"
                    key={step.name}
                  >
                    <div
                      className="h-16 w-full bg-surface/[0.06] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                      style={{ borderRadius: `${step.px}px` }}
                    />
                    <div className="flex flex-row items-center justify-between gap-2">
                      <Text className="text-xs font-semibold text-surface">
                        {step.name}
                      </Text>
                      <Text className="font-mono text-2xs uppercase text-surface/60">
                        {step.px}px
                      </Text>
                    </div>
                    <Text className="text-2xs leading-4 text-surface/60">
                      {step.use}
                    </Text>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Content is the accent: centerpiece */}
        <section className="border-b border-edge/5 bg-fill/[0.02] py-20 sm:py-24">
          <div className="container mx-auto px-6">
            <div className="flex flex-col mx-auto max-w-3xl gap-5 text-center">
              <SectionLabel>The principle</SectionLabel>
              <Heading
                as="h2"
                className="font-semibold tracking-[-0.02em] text-4xl leading-tight text-surface sm:text-5xl"
              >
                Content is the accent.
              </Heading>
              <Text className="text-base leading-7 text-surface/55">
                Genfeed chrome is a neutral studio, the gallery wall, not the
                art. The product's output is inherently colorful, so the
                interface never competes with it. Color enters through exactly
                four doors; everything else is grayscale.
              </Text>
            </div>

            <div className="mx-auto mt-12 grid max-w-6xl gap-px bg-edge/5 sm:grid-cols-2 lg:grid-cols-4">
              {COLOR_DOORS.map((door) => (
                <div
                  className="flex flex-col gap-4 bg-background p-6"
                  key={door.index}
                >
                  <Text className="font-mono text-xs text-surface/55">
                    {door.index}
                  </Text>
                  <Heading
                    as="h3"
                    className="text-base font-semibold text-surface"
                  >
                    {door.title}
                  </Heading>
                  <Text className="text-sm leading-6 text-surface/55">
                    {door.body}
                  </Text>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Do's and Don'ts */}
        <section className="py-16 sm:py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto grid max-w-6xl gap-px bg-edge/5 lg:grid-cols-2">
              <div className="flex flex-col gap-5 bg-background p-6 sm:p-8">
                <SectionLabel>Do</SectionLabel>
                <ul className="space-y-3.5">
                  {DOS.map((item) => (
                    <li
                      className="flex gap-3 text-sm leading-6 text-surface/65"
                      key={item}
                    >
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-success" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col gap-5 bg-background p-6 sm:p-8">
                <SectionLabel>Don't</SectionLabel>
                <ul className="space-y-3.5">
                  {DONTS.map((item) => (
                    <li
                      className="flex gap-3 text-sm leading-6 text-surface/65"
                      key={item}
                    >
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-danger" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex flex-row items-center mt-12 flex-wrap justify-center gap-3">
              <Button
                asChild
                size={ButtonSize.PUBLIC}
                variant={ButtonVariant.SECONDARY}
              >
                <a href={appHref} rel="noopener noreferrer" target="_blank">
                  Open the studio
                </a>
              </Button>
              <Button
                asChild
                size={ButtonSize.PUBLIC}
                variant={ButtonVariant.GHOST}
              >
                <Link href="/">Back to Genfeed.ai</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <HomeFooter />
    </div>
  );
}
