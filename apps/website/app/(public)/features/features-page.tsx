'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import { Button } from '@ui/primitives/button';
import { HOME_OUTPUT_CAROUSEL_ASSETS } from '@web-components/home/_assets';
import PageLayout from '@web-components/PageLayout';
import ProductInterfacePreview from '@web-components/product/ProductInterfacePreview';
import {
  ArrowRight,
  Cpu,
  Database,
  Layers,
  MonitorPlay,
  ShieldCheck,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

const FEATURES = [
  {
    description:
      'Every photo, video, and file organized and searchable. Find what you need in seconds, not minutes.',
    icon: Database,
    label: 'Asset Library',
    number: '01',
    title: 'Find Any Asset Instantly',
  },
  {
    description:
      'Use the current image, video, voice, music, and language models published in the live product registry.',
    icon: Cpu,
    label: 'AI Engine',
    number: '02',
    title: 'Live Models, One Prompt',
  },
  {
    description:
      'Enterprise-grade security. Your brand assets, custom models, and content stay private and protected.',
    icon: ShieldCheck,
    label: 'Security',
    number: '03',
    title: 'Your Brand, Your Data',
  },
  {
    description:
      'Create finished video, image, voice, and written assets, then refine and package them in the same workflow.',
    icon: MonitorPlay,
    label: 'Quality',
    number: '04',
    title: 'Finished Outputs, One Workflow',
  },
];

const HERO_VISUAL = (
  <ProductInterfacePreview
    product={{
      category: 'Control plane',
      features: FEATURES,
      headline: 'Create, organize, govern, and ship from one operating system.',
      name: 'Genfeed',
      useCases: FEATURES.slice(0, 3).map((feature) => ({
        description: feature.description,
        title: feature.label,
      })),
    }}
  />
);

const SHOWCASE_OUTPUTS = HOME_OUTPUT_CAROUSEL_ASSETS.slice(0, 3);

export default function FeaturesPage(): React.ReactElement {
  const containerRef = useMarketingEntrance();

  return (
    <div ref={containerRef}>
      <PageLayout
        badge="Platform Capabilities"
        badgeIcon={Layers}
        compact
        heroVisual={HERO_VISUAL}
        title={<>What Genfeed Does For You</>}
        description="Every feature saves you time and eliminates busywork. Here is exactly what you get."
      >
        {/* Features Grid */}
        <section className="gsap-hero py-32">
          <div className="container mx-auto px-6">
            <div className="gsap-grid grid grid-cols-1 gap-px bg-edge/5 md:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.number}
                    className="gsap-card bg-background p-12 flex flex-col group hover:bg-fill/[0.02] transition-colors"
                  >
                    <div className="text-surface/50 text-xs font-black uppercase tracking-widest mb-12">
                      {feature.number} / {feature.label}
                    </div>
                    <Icon className="size-10 mb-8 text-surface/55 group-hover:text-surface transition-all" />
                    <h3 className="text-xl font-semibold uppercase tracking-tight mb-4">
                      {feature.title}
                    </h3>
                    <p className="text-surface/65 text-sm leading-relaxed mb-8">
                      {feature.description}
                    </p>
                    <span className="mt-auto text-2xs font-black uppercase tracking-widest flex items-center gap-2 hover:gap-4 transition-all cursor-pointer">
                      Learn More <ArrowRight className="size-3" />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="gsap-section bg-fill/[0.02] py-32">
          <div className="container mx-auto px-6">
            <div className="mb-14 max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-surface/45">
                Made in Genfeed
              </p>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                The output is the proof.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-surface/60">
                Campaign systems, short-form video, and finished creative made
                inside the same product shown above.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {SHOWCASE_OUTPUTS.map((output) => (
                <figure
                  className="relative aspect-[4/5] overflow-hidden rounded-xl bg-card"
                  key={output.alt}
                >
                  <Image
                    alt={output.alt}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    src={output.src}
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <figcaption className="absolute inset-x-0 bottom-0 p-6">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">
                      {output.format}
                    </p>
                    <p className="mt-2 text-xl font-semibold text-white">
                      {output.title}
                    </p>
                  </figcaption>
                </figure>
              ))}
            </div>
            <div className="mt-12 flex flex-wrap items-center justify-between gap-6 border-t border-edge/10 pt-8">
              <p className="max-w-xl text-sm leading-6 text-surface/55">
                Model availability is read from the live registry. The website
                does not maintain a model-name list in marketing copy.
              </p>
              <Button
                asChild
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.PUBLIC}
              >
                <Link href="/models">View live models</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-40">
          <div className="container mx-auto px-6">
            <div className="text-center max-w-3xl mx-auto">
              <h2 className="text-6xl font-semibold mb-10">
                Start Creating Today
              </h2>
              <p className="text-surface/65 text-xl mb-12 font-medium">
                Start creating in minutes. Choose the plan that fits your team.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button
                  asChild
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.PUBLIC}
                  className="tracking-[0.3em]"
                >
                  <Link href="/pricing">View Plans</Link>
                </Button>
                <Button
                  asChild
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.PUBLIC}
                  className="tracking-[0.3em]"
                >
                  <Link href="/demo">See How It Works</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </PageLayout>
    </div>
  );
}
