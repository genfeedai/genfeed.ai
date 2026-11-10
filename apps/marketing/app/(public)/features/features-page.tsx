import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import AgentFirstActions from '@web-components/buttons/agent-first-actions/AgentFirstActions';
import MarketingArtwork from '@web-components/content/MarketingArtwork';
import { HOME_OUTPUT_CAROUSEL_ASSETS } from '@web-components/home/_assets';
import MarketingEntrance from '@web-components/MarketingEntrance';
import PageLayout from '@web-components/PageLayout';
import AppProductScreenshot from '@web-components/products/AppProductScreenshot';
import {
  ArrowRight,
  BarChart3,
  LayoutDashboard,
  Plug,
  TrendingUp,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

const FEATURES = [
  {
    description:
      'Connect Claude, ChatGPT, Codex, Cursor or any MCP client. Your agent drafts and schedules with your brand context, and results land in the dashboard.',
    icon: Plug,
    label: 'Your agent',
    href: '/agent',
    number: '01',
    title: 'Work Where You Already Work',
  },
  {
    description:
      'See what is working in your market, as observed samples, so every brief starts from what people are responding to.',
    icon: TrendingUp,
    label: 'Trends',
    href: '/products/discovery',
    number: '02',
    title: 'Start From What Is Working',
  },
  {
    description:
      'Videos, images and posts land in one library with your brand attached. Review them, then publish to your connected channels.',
    icon: LayoutDashboard,
    label: 'Dashboard',
    href: '/products/publishing',
    number: '03',
    title: 'Review And Publish In One Place',
  },
  {
    description:
      'Post performance in one view, and your top posts come back as examples for the next brief.',
    icon: BarChart3,
    label: 'Analytics',
    href: '/products/analytics',
    number: '04',
    title: 'See What Worked',
  },
];

const HERO_VISUAL = (
  <AppProductScreenshot
    alt="The Genfeed agent working next to its output."
    isPriority
    src="/products/agent.webp"
  />
);

const SHOWCASE_OUTPUTS = HOME_OUTPUT_CAROUSEL_ASSETS.slice(0, 3);

export default function FeaturesPage(): React.ReactElement {
  return (
    <MarketingEntrance>
      <PageLayout
        heroMedia={
          <MarketingArtwork page="/features" isCompact kind="workflow" />
        }
        compact
        heroVisual={HERO_VISUAL}
        title={<>What Genfeed Does</>}
        description="Brief Genfeed from the agent you already use. Start from trends, create videos, images and posts in Genfeed Studio, then publish and see what worked in the dashboard."
      >
        <section className="gsap-hero py-16 md:py-32">
          <div className="container mx-auto px-6">
            <div className="gsap-grid grid grid-cols-1 gap-px bg-foreground/10 md:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.number}
                    className="gsap-card bg-background p-6 sm:p-12 flex flex-col group hover:bg-foreground/5 transition-colors"
                  >
                    <div className="text-foreground/50 text-xs font-black uppercase tracking-widest mb-12">
                      {feature.number} / {feature.label}
                    </div>
                    <Icon className="size-10 mb-8 text-foreground/60 group-hover:text-foreground transition-all" />
                    <h3 className="text-xl font-semibold uppercase tracking-tight mb-4">
                      {feature.title}
                    </h3>
                    <p className="text-foreground/70 text-sm leading-relaxed mb-8">
                      {feature.description}
                    </p>
                    <Link
                      className="mt-auto flex items-center gap-2 text-2xs font-black uppercase tracking-widest transition-all hover:gap-4"
                      href={feature.href}
                    >
                      Learn more <ArrowRight className="size-3.5" />
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="gsap-section bg-foreground/5 py-16 md:py-32">
          <div className="container mx-auto px-6">
            <div className="mb-14 max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-foreground/50">
                Made in Genfeed
              </p>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.02em] sm:text-5xl">
                The output is the proof.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-foreground/60">
                Short-form video, images and campaign creative, made with
                Genfeed and ready to review.
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
                    src={output.poster}
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  {/* ui-guard-allow:metric-hand-built -- caption over a poster, not a stat */}
                  <figcaption className="absolute inset-x-0 bottom-0 p-6">
                    <p
                      className={
                        'text-2xs font-bold uppercase tracking-[0.14em] text-white/60' /* design-system-allow-content-color -- caption over a poster */
                      }
                    >
                      {output.format}
                    </p>
                    <p
                      className={
                        'mt-2 text-xl font-semibold text-white' /* design-system-allow-content-color -- caption over a poster */
                      }
                    >
                      {output.title}
                    </p>
                  </figcaption>
                </figure>
              ))}
            </div>
            <div className="mt-12 flex flex-wrap items-center justify-between gap-6 border-t border-foreground/10 pt-8">
              <p className="max-w-xl text-sm leading-6 text-foreground/60">
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

        <section className="py-20 md:py-40">
          <div className="container mx-auto px-6">
            <div className="text-center max-w-3xl mx-auto">
              <h2 className="text-6xl font-semibold mb-10">
                Start in your agent.
              </h2>
              <p className="text-foreground/70 text-xl mb-12 font-medium">
                Connecting takes one sign-in.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <AgentFirstActions trackingName="features_cta_click" />
                <Button
                  asChild
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.PUBLIC}
                >
                  <Link href="/pricing">View Plans</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </PageLayout>
    </MarketingEntrance>
  );
}
