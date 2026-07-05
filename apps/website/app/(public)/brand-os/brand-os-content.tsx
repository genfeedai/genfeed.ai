'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import { EnvironmentService } from '@services/core/environment.service';
import { HStack, VStack } from '@ui/layout/stack';
import { Button } from '@ui/primitives/button';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import HomeFooter from '@web-components/home/_footer';
import Link from 'next/link';
import { LuLayers } from 'react-icons/lu';

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
  { hex: '#050607', name: 'bg-primary', role: 'Main canvas, sidebar' },
  { hex: '#0c0d10', name: 'bg-secondary', role: 'Cards, panels' },
  { hex: '#131518', name: 'bg-tertiary', role: 'Inputs, nested surfaces' },
  { hex: '#1a1c21', name: 'bg-elevated', role: 'Popovers, dropdowns' },
  { hex: '#20232a', name: 'bg-hover', role: 'Interactive hover states' },
];

const TEXT_TIERS: Swatch[] = [
  { hex: '#f4f4f5', name: 'text-primary', role: 'Primary content' },
  { hex: '#b4b4bc', name: 'text-secondary', role: 'Secondary labels' },
  { hex: '#6b6b78', name: 'text-muted', role: 'Muted / metadata' },
];

const ACCENT: Swatch[] = [
  { hex: '#fafafa', name: 'accent', role: 'Primary CTA on dark' },
  { hex: '#050607', name: 'accent-foreground', role: 'Text on accent' },
  { hex: '#e4e4e7', name: 'accent-hover', role: 'CTA hover' },
];

const SEMANTIC: Swatch[] = [
  { hex: '#10b981', name: 'Success', role: 'Completed, passing, published' },
  {
    hex: '#f59e0b',
    name: 'Warning',
    role: 'Needs attention, awaiting approval',
  },
  { hex: '#ef4444', name: 'Danger', role: 'Failed, errored, rejected' },
  { hex: '#3b82f6', name: 'Info', role: 'Informational, neutral status' },
];

const DOMAIN: Swatch[] = [
  { hex: '#38bdf8', name: 'Agent', role: 'AI agent activity states' },
  { hex: '#a855f7', name: 'Done', role: 'Completed workflows' },
];

const PLATFORMS: { hex: string; name: string }[] = [
  { hex: '#FCD34D', name: 'Beehiiv' },
  { hex: '#5865F2', name: 'Discord' },
  { hex: '#1877F2', name: 'Facebook' },
  { hex: '#6C63FF', name: 'Fanvue' },
  { hex: '#15171A', name: 'Ghost' },
  { hex: '#E1306C', name: 'Instagram' },
  { hex: '#0A66C2', name: 'LinkedIn' },
  { hex: '#6364FF', name: 'Mastodon' },
  { hex: '#00AB6C', name: 'Medium' },
  { hex: '#000000', name: 'Notion' },
  { hex: '#E60023', name: 'Pinterest' },
  { hex: '#FF4500', name: 'Reddit' },
  { hex: '#96BF48', name: 'Shopify' },
  { hex: '#4A154B', name: 'Slack' },
  { hex: '#FFFC00', name: 'Snapchat' },
  { hex: '#FF6719', name: 'Substack' },
  { hex: '#26A5E4', name: 'Telegram' },
  { hex: '#000000', name: 'Threads' },
  { hex: '#FE2C55', name: 'TikTok' },
  { hex: '#9146FF', name: 'Twitch' },
  { hex: '#1DA1F2', name: 'Twitter' },
  { hex: '#25D366', name: 'WhatsApp' },
  { hex: '#21759B', name: 'WordPress' },
  { hex: '#FF0000', name: 'YouTube' },
];

const TYPE_SCALE: ScaleRow[] = [
  { element: 'Badge / chip', size: '10px' },
  { element: 'Table head', size: '11px' },
  { element: 'Table cell', size: '12px' },
  { element: 'Body / button', size: '13px' },
  { element: 'Card title', size: '14px' },
];

const RADIUS_STEPS: RadiusStep[] = [
  { name: 'sm', px: 2, use: 'Badges, tags, inline chips' },
  { name: 'md', px: 6, use: 'Cards, buttons, inputs, tooltips, popovers' },
  { name: 'lg', px: 8, use: 'Toasts, overlay panels' },
  { name: 'xl', px: 10, use: 'Dialogs, command palette' },
];

const COLOR_DOORS: ColorDoor[] = [
  {
    body: 'Generated media is the primary color source. Rendered borderless and full-bleed wherever possible — chrome recedes behind it.',
    index: '01',
    title: 'User content',
  },
  {
    body: 'Platform brand tokens, scoped to badges and icons only. Never layout chrome or primary actions.',
    index: '02',
    title: 'Platform identifiers',
  },
  {
    body: 'Success, warning, danger, info. Applied to state — never decoration.',
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
  'Use background layering for hierarchy instead of heavy borders.',
  'Use inset box-shadow borders on elevated surfaces — cards, dialogs, dropdowns.',
  'Reserve the border token for structural dividers: sidebar edges, header bottoms.',
  'Use ghost buttons for toolbar and topbar actions.',
  'Apply semantic status colors consistently across every surface.',
  'Use −0.01em letter-spacing on body, tighter on headings.',
];

const DONTS: string[] = [
  'Use a CSS border for card, dialog, or dropdown containment — use inset shadow.',
  'Mix hardcoded colors with token references.',
  'Use the accent for status — it is for primary CTAs only.',
  'Add a new semantic color without updating DESIGN.md.',
  'Use large decorative gradients as core product surfaces.',
  'Nest cards inside cards, or add glow / spotlight shadows to chrome.',
];

function SectionLabel({ children }: { children: string }): React.ReactElement {
  return (
    <Text className="text-[10px] font-black uppercase tracking-[0.2em] text-surface/35">
      {children}
    </Text>
  );
}

function SwatchTile({ swatch }: { swatch: Swatch }): React.ReactElement {
  return (
    <VStack className="gap-2">
      <span
        aria-label={`${swatch.name} ${swatch.hex}`}
        className="block h-16 border border-edge/10"
        role="img"
        style={{ backgroundColor: swatch.hex }}
      />
      <VStack className="gap-0.5">
        <HStack className="items-center justify-between gap-2">
          <Text className="text-xs font-semibold text-surface">
            {swatch.name}
          </Text>
          <Text className="font-mono text-[10px] uppercase text-surface/35">
            {swatch.hex}
          </Text>
        </HStack>
        <Text className="text-[11px] leading-4 text-surface/40">
          {swatch.role}
        </Text>
      </VStack>
    </VStack>
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
            <VStack className="max-w-4xl gap-6">
              <HStack className="w-fit items-center gap-2 border border-edge/10 bg-fill/[0.02] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-surface/45">
                <LuLayers className="size-3.5" />
                <Text>Brand OS</Text>
                <span className="text-surface/20">/</span>
                <Text className="text-surface/35">version alpha</Text>
              </HStack>

              <Heading
                as="h1"
                className="max-w-3xl font-serif text-5xl leading-none text-surface sm:text-6xl lg:text-7xl"
              >
                The Genfeed Brand OS.
              </Heading>

              <Text className="max-w-2xl text-base leading-7 text-surface/55 sm:text-lg">
                The living design system behind Genfeed — dark-first,
                information-dense, and aligned with the ShipCode and Linear
                visual language. Depth comes from layered background tones and
                inset-shadow containment; color enters only through the
                product's content. This page is the system itself, drawn from{' '}
                <span className="font-mono text-surface/70">DESIGN.md</span>.
              </Text>
            </VStack>
          </div>
        </section>

        {/* Color — backgrounds + text */}
        <section className="border-b border-edge/5 bg-fill/[0.02] py-16 sm:py-20">
          <div className="container mx-auto grid gap-12 px-6 lg:grid-cols-[0.32fr_1fr] lg:gap-16">
            <VStack className="gap-4">
              <SectionLabel>Foundations</SectionLabel>
              <Heading as="h2" className="font-serif text-4xl text-surface">
                Depth without borders.
              </Heading>
              <Text className="text-sm leading-6 text-surface/55">
                Five background tones create elevation from the deepest canvas
                to the most raised surface — no heavy strokes, just tonal shift.
                Text resolves in three tiers over the top.
              </Text>
            </VStack>

            <VStack className="gap-10">
              <VStack className="gap-4">
                <SectionLabel>Background layers</SectionLabel>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                  {BACKGROUND_LAYERS.map((swatch) => (
                    <SwatchTile key={swatch.name} swatch={swatch} />
                  ))}
                </div>
              </VStack>

              <div className="grid gap-10 sm:grid-cols-2">
                <VStack className="gap-4">
                  <SectionLabel>Text hierarchy</SectionLabel>
                  <div className="grid grid-cols-3 gap-4">
                    {TEXT_TIERS.map((swatch) => (
                      <SwatchTile key={swatch.name} swatch={swatch} />
                    ))}
                  </div>
                </VStack>
                <VStack className="gap-4">
                  <SectionLabel>Accent — inverted for dark</SectionLabel>
                  <div className="grid grid-cols-3 gap-4">
                    {ACCENT.map((swatch) => (
                      <SwatchTile key={swatch.name} swatch={swatch} />
                    ))}
                  </div>
                </VStack>
              </div>
            </VStack>
          </div>
        </section>

        {/* Semantic + domain */}
        <section className="border-b border-edge/5 py-16 sm:py-20">
          <div className="container mx-auto grid gap-12 px-6 lg:grid-cols-[0.32fr_1fr] lg:gap-16">
            <VStack className="gap-4">
              <SectionLabel>Signal</SectionLabel>
              <Heading as="h2" className="font-serif text-4xl text-surface">
                Color that means something.
              </Heading>
              <Text className="text-sm leading-6 text-surface/55">
                Status and domain colors map directly to state and workflow —
                never decoration. Four semantic tones, two domain tones.
              </Text>
            </VStack>

            <VStack className="gap-10">
              <VStack className="gap-4">
                <SectionLabel>Semantic status</SectionLabel>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {SEMANTIC.map((swatch) => (
                    <SwatchTile key={swatch.name} swatch={swatch} />
                  ))}
                </div>
              </VStack>
              <VStack className="gap-4">
                <SectionLabel>Domain</SectionLabel>
                <div className="grid grid-cols-2 gap-4 sm:max-w-md">
                  {DOMAIN.map((swatch) => (
                    <SwatchTile key={swatch.name} swatch={swatch} />
                  ))}
                </div>
              </VStack>
            </VStack>
          </div>
        </section>

        {/* Platform identifiers */}
        <section className="border-b border-edge/5 bg-fill/[0.02] py-16 sm:py-20">
          <div className="container mx-auto grid gap-12 px-6 lg:grid-cols-[0.32fr_1fr] lg:gap-16">
            <VStack className="gap-4">
              <SectionLabel>Identifiers</SectionLabel>
              <Heading as="h2" className="font-serif text-4xl text-surface">
                Platform tokens.
              </Heading>
              <Text className="text-sm leading-6 text-surface/55">
                Twenty-four brand colors used as identifiers only — on platform
                icons, connection badges, and analytics breakdowns. Never for
                layout chrome or primary actions.
              </Text>
            </VStack>

            <div className="grid grid-cols-3 gap-x-4 gap-y-5 sm:grid-cols-4 lg:grid-cols-6">
              {PLATFORMS.map((platform) => (
                <HStack className="items-center gap-2.5" key={platform.name}>
                  <span
                    aria-hidden
                    className="size-6 shrink-0 rounded-sm border border-edge/10"
                    style={{ backgroundColor: platform.hex }}
                  />
                  <VStack className="gap-0">
                    <Text className="text-xs font-medium text-surface/80">
                      {platform.name}
                    </Text>
                    <Text className="font-mono text-[10px] uppercase text-surface/30">
                      {platform.hex}
                    </Text>
                  </VStack>
                </HStack>
              ))}
            </div>
          </div>
        </section>

        {/* Typography + radius */}
        <section className="border-b border-edge/5 py-16 sm:py-20">
          <div className="container mx-auto grid gap-12 px-6 lg:grid-cols-2 lg:gap-16">
            <VStack className="gap-6">
              <VStack className="gap-3">
                <SectionLabel>Typography</SectionLabel>
                <Heading as="h2" className="font-serif text-4xl text-surface">
                  A dense, deliberate scale.
                </Heading>
                <Text className="text-sm leading-6 text-surface/55">
                  System sans for the interface, mono for code and tokens. Body
                  sits at 13px with −0.01em tracking; headings tighten to
                  −0.03em.
                </Text>
              </VStack>
              <div className="border border-edge/5 bg-fill/[0.02]">
                {TYPE_SCALE.map((row) => (
                  <HStack
                    className="items-center justify-between gap-4 border-b border-edge/5 px-5 py-3.5 last:border-b-0"
                    key={row.element}
                  >
                    <Text className="text-sm text-surface/70">
                      {row.element}
                    </Text>
                    <Text className="font-mono text-[11px] uppercase text-surface/40">
                      {row.size}
                    </Text>
                  </HStack>
                ))}
              </div>
            </VStack>

            <VStack className="gap-6">
              <VStack className="gap-3">
                <SectionLabel>Form</SectionLabel>
                <Heading as="h2" className="font-serif text-4xl text-surface">
                  Four-step radius.
                </Heading>
                <Text className="text-sm leading-6 text-surface/55">
                  Corners map to purpose, matching the ShipCode and Linear
                  language. Elevated surfaces use inset box-shadow for
                  containment instead of a CSS border.
                </Text>
              </VStack>
              <div className="grid gap-4 sm:grid-cols-2">
                {RADIUS_STEPS.map((step) => (
                  <VStack
                    className="gap-3 border border-edge/5 bg-fill/[0.02] p-5"
                    key={step.name}
                  >
                    <div
                      className="h-16 w-full bg-surface/[0.06] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                      style={{ borderRadius: `${step.px}px` }}
                    />
                    <HStack className="items-center justify-between gap-2">
                      <Text className="text-xs font-semibold text-surface">
                        {step.name}
                      </Text>
                      <Text className="font-mono text-[10px] uppercase text-surface/40">
                        {step.px}px
                      </Text>
                    </HStack>
                    <Text className="text-[11px] leading-4 text-surface/40">
                      {step.use}
                    </Text>
                  </VStack>
                ))}
              </div>
            </VStack>
          </div>
        </section>

        {/* Content is the accent — centerpiece */}
        <section className="border-b border-edge/5 bg-fill/[0.02] py-20 sm:py-24">
          <div className="container mx-auto px-6">
            <VStack className="mx-auto max-w-3xl gap-5 text-center">
              <SectionLabel>The principle</SectionLabel>
              <Heading
                as="h2"
                className="font-serif text-4xl leading-tight text-surface sm:text-5xl"
              >
                Content is the accent.
              </Heading>
              <Text className="text-base leading-7 text-surface/55">
                Genfeed chrome is a neutral studio — the gallery wall, not the
                art. The product's output is inherently colorful, so the
                interface never competes with it. Color enters through exactly
                four doors; everything else is grayscale.
              </Text>
            </VStack>

            <div className="mx-auto mt-12 grid max-w-6xl gap-px bg-edge/5 sm:grid-cols-2 lg:grid-cols-4">
              {COLOR_DOORS.map((door) => (
                <VStack className="gap-4 bg-background p-6" key={door.index}>
                  <Text className="font-mono text-xs text-surface/30">
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
                </VStack>
              ))}
            </div>
          </div>
        </section>

        {/* Do's and Don'ts */}
        <section className="py-16 sm:py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto grid max-w-6xl gap-px bg-edge/5 lg:grid-cols-2">
              <VStack className="gap-5 bg-background p-6 sm:p-8">
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
              </VStack>
              <VStack className="gap-5 bg-background p-6 sm:p-8">
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
              </VStack>
            </div>

            <HStack className="mt-12 flex-wrap justify-center gap-3">
              <Button asChild size={ButtonSize.PUBLIC}>
                <a href={appHref} rel="noopener noreferrer" target="_blank">
                  Open the studio
                </a>
              </Button>
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
