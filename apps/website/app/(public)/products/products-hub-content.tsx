import {
  APP_PRODUCT_ACCESS_LABELS,
  APP_PRODUCT_GROUPS,
  getAppProductsByGroup,
} from '@data/app-products.data';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import AgentFirstActions from '@web-components/buttons/agent-first-actions/AgentFirstActions';
import MarketingEntrance from '@web-components/MarketingEntrance';
import PageLayout from '@web-components/PageLayout';
import AppProductScreenshot from '@web-components/products/AppProductScreenshot';
import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

const GROUP_DESCRIPTIONS: Record<(typeof APP_PRODUCT_GROUPS)[number], string> =
  {
    Create: 'Generate, plan and edit images, video and sequences.',
    Operate: 'Ask an agent, run workflows and keep every asset in one library.',
    'Publish & grow':
      'Publish, measure, research what works and keep up with your audience.',
  };

export default function ProductsHubContent() {
  return (
    <MarketingEntrance>
      <PageLayout
        compact
        description="One workspace, one app per job. Every Genfeed product below is a real page of the app, from generating a first image to publishing and measuring it."
        heroActions={<AgentFirstActions trackingName="products_hero_click" />}
        heroVisual={
          <AppProductScreenshot
            alt="The Genfeed Playground with the prompt bar open and generated images in the canvas"
            isPriority
            src="/products/playground.webp"
          />
        }
        title="Genfeed Products"
      >
        {APP_PRODUCT_GROUPS.map((group) => (
          <section
            className="gsap-section mx-auto max-w-6xl px-6 pb-24"
            key={group}
          >
            <div className="mb-10 max-w-2xl">
              <Heading
                as="h2"
                className="text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-4xl"
              >
                {group}
              </Heading>
              <Text className="mt-3 text-base leading-7 text-foreground/65">
                {GROUP_DESCRIPTIONS[group]}
              </Text>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {getAppProductsByGroup(group).map((product) => (
                <Link
                  className="group flex flex-col overflow-hidden rounded-lg border border-foreground/10 bg-card transition-colors hover:border-foreground/25"
                  href={`/products/${product.slug}`}
                  key={product.slug}
                >
                  <Image
                    alt={product.screenshot.alt}
                    className="h-auto w-full border-b border-foreground/10"
                    height={900}
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 380px"
                    src={product.screenshot.src}
                    width={1440}
                  />
                  <div className="flex flex-1 flex-col p-6">
                    <Heading
                      as="h3"
                      className="text-xl font-semibold text-foreground"
                    >
                      {product.name}
                    </Heading>
                    <Text className="mt-2 text-sm leading-6 text-foreground/65">
                      {product.tagline}
                    </Text>
                    <Text className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-foreground/45">
                      {APP_PRODUCT_ACCESS_LABELS[product.access]}
                    </Text>
                    <span className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-semibold text-foreground">
                      Explore {product.name}
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}

        <section className="mx-auto max-w-4xl px-6 pb-24 text-center">
          <Heading
            as="h2"
            className="text-3xl font-semibold tracking-[-0.02em] text-foreground"
          >
            Build your workspace
          </Heading>
          <Text className="mx-auto mt-4 max-w-xl text-base leading-7 text-foreground/65">
            Playground, Storyboard, Publishing, Analytics, Discovery, Agent and
            Library are ready from the start. Add Clipper, Motion, Turbo,
            Editor, Automation and Messages from Apps when you need them.
          </Text>
          <div className="mt-8 flex flex-row flex-wrap items-center justify-center gap-4">
            <AgentFirstActions trackingName="products_cta_click" />
          </div>
        </section>
      </PageLayout>
    </MarketingEntrance>
  );
}
