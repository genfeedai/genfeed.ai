import {
  APP_PRODUCT_ACCESS_LABELS,
  type AppProduct,
  getRelatedAppProducts,
} from '@data/app-products.data';
import Badge from '@ui/display/badge/Badge';
import PricingStrip from '@ui/marketing/PricingStrip';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import AgentFirstActions from '@web-components/buttons/agent-first-actions/AgentFirstActions';
import FaqGrid from '@web-components/content/FaqGrid';
import MarketingEntrance from '@web-components/MarketingEntrance';
import PageLayout from '@web-components/PageLayout';
import AppProductScreenshot from '@web-components/products/AppProductScreenshot';
import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';

interface AppProductContentProps {
  product: AppProduct;
}

function SectionHeading({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="mb-10 max-w-2xl">
      <Text className="text-xs font-bold uppercase tracking-[0.16em] text-foreground/60">
        {eyebrow}
      </Text>
      <Heading
        as="h2"
        className="mt-4 text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-4xl"
      >
        {title}
      </Heading>
    </div>
  );
}

export default function AppProductContent({ product }: AppProductContentProps) {
  const related = getRelatedAppProducts(product.slug);

  return (
    <MarketingEntrance>
      <PageLayout
        compact
        description={product.tagline}
        heroActions={
          <AgentFirstActions trackingName={`product_${product.slug}_hero`} />
        }
        heroDetails={
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{product.group}</Badge>
            <Badge variant="secondary">
              {APP_PRODUCT_ACCESS_LABELS[product.access]}
            </Badge>
          </div>
        }
        heroVisual={
          <AppProductScreenshot
            alt={product.screenshot.alt}
            isPriority
            src={product.screenshot.src}
          />
        }
        title={`Genfeed ${product.name}`}
      >
        <section className="gsap-section mx-auto max-w-6xl px-6 pb-24">
          <div className="grid gap-12 border-y border-foreground/10 py-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-24 lg:py-20">
            <div>
              <Text className="text-xs font-bold uppercase tracking-[0.16em] text-foreground/60">
                What it is
              </Text>
              <Heading
                as="h2"
                className="mt-5 text-4xl font-semibold leading-[1.05] tracking-[-0.02em] text-foreground sm:text-5xl"
              >
                What is {product.name}?
              </Heading>
            </div>
            <div className="flex flex-col gap-8">
              <Text className="max-w-xl text-base leading-7 text-foreground/80">
                {product.definition}
              </Text>
              <ul className="flex flex-col gap-3">
                {product.highlights.map((highlight) => (
                  <li
                    className="flex items-start gap-3 text-sm text-foreground/80"
                    key={highlight}
                  >
                    <Check className="mt-0.5 size-4 shrink-0 text-[color:hsl(var(--gen-accent))]" />
                    {highlight}
                  </li>
                ))}
              </ul>
              {product.learnMore ? (
                <Link
                  className="inline-flex items-center gap-2 text-sm font-semibold text-foreground underline underline-offset-4"
                  href={product.learnMore.href}
                >
                  {product.learnMore.label}
                  <ArrowRight className="size-4" />
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        <section className="gsap-section mx-auto max-w-6xl px-6 pb-24">
          <SectionHeading eyebrow="How it works" title="From idea to result" />
          <ol className="gsap-grid grid grid-cols-1 border-t border-foreground/10 md:grid-cols-2 lg:grid-cols-4">
            {product.steps.map((step) => (
              <li
                className="gsap-card border-b border-foreground/10 py-8 md:px-6 md:first:pl-0 lg:border-b-0 lg:border-r lg:last:border-r-0 lg:last:pr-0"
                key={step.title}
              >
                <Heading as="h3" className="font-semibold text-foreground">
                  {step.title}
                </Heading>
                <Text className="mt-2 text-sm leading-6 text-foreground/70">
                  {step.description}
                </Text>
              </li>
            ))}
          </ol>
        </section>

        <section className="gsap-section mx-auto max-w-6xl px-6 pb-24">
          <SectionHeading
            eyebrow="Use cases"
            title={`What teams use ${product.name} for`}
          />
          <div className="gsap-grid grid grid-cols-1 border-t border-foreground/10 md:grid-cols-3">
            {product.useCases.map((useCase) => (
              <div
                className="gsap-card border-b border-foreground/10 py-8 md:border-r md:px-8 md:first:pl-0 md:last:border-r-0 md:last:pr-0"
                key={useCase.title}
              >
                <Heading as="h3" className="font-semibold text-foreground">
                  {useCase.title}
                </Heading>
                <Text className="mt-3 text-sm leading-6 text-foreground/70">
                  {useCase.description}
                </Text>
              </div>
            ))}
          </div>
        </section>

        <section className="gsap-section mx-auto max-w-6xl px-6 pb-24">
          <SectionHeading
            eyebrow="Outputs"
            title={`What ${product.name} produces`}
          />
          <div className="gsap-grid grid grid-cols-1 gap-px bg-foreground/5 md:grid-cols-2 lg:grid-cols-3">
            {product.outputs.map((output) => (
              <div
                className="gsap-card bg-background p-6 sm:p-8"
                key={output.title}
              >
                <Heading as="h3" className="font-semibold text-foreground">
                  {output.title}
                </Heading>
                <Text className="mt-3 text-sm leading-6 text-foreground/70">
                  {output.description}
                </Text>
              </div>
            ))}
          </div>
        </section>

        <section className="gsap-section mx-auto max-w-4xl px-6 pb-24">
          <SectionHeading
            eyebrow="Access and pricing"
            title="Start free, pay for output"
          />
          <Text className="mb-8 max-w-xl text-base leading-7 text-foreground/70">
            {APP_PRODUCT_ACCESS_LABELS[product.access]}. Generation spends
            credits, and the open source Community build is free to self-host.
          </Text>
          <PricingStrip />
        </section>

        <section className="gsap-section mx-auto max-w-6xl px-6 pb-24">
          <SectionHeading
            eyebrow="FAQ"
            title={`${product.name}: common questions`}
          />
          <FaqGrid items={product.faqs} />
        </section>

        {related.length > 0 ? (
          <section className="gsap-section mx-auto max-w-6xl px-6 pb-24">
            <SectionHeading eyebrow="Keep going" title="Works with" />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {related.map((item) => (
                <Link
                  className="group flex flex-col rounded-lg border border-foreground/10 p-6 transition-colors hover:border-foreground/20"
                  href={`/products/${item.slug}`}
                  key={item.slug}
                >
                  <Heading as="h3" className="font-semibold text-foreground">
                    {item.name}
                  </Heading>
                  <Text className="mt-2 text-sm leading-6 text-foreground/70">
                    {item.tagline}
                  </Text>
                  <span className="mt-auto inline-flex items-center gap-2 pt-4 text-sm font-semibold text-foreground">
                    Learn more
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
              ))}
            </div>
            <Link
              className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-foreground underline underline-offset-4"
              href="/products"
            >
              See every Genfeed product
              <ArrowRight className="size-4" />
            </Link>
          </section>
        ) : null}

        <section className="mx-auto max-w-4xl px-6 pb-16">
          <div className="border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)] p-6 text-center sm:p-12">
            <Heading
              as="h2"
              className="mb-2 text-2xl font-bold text-foreground"
            >
              Try {product.name}
            </Heading>
            <Text as="p" className="mx-auto mb-6 max-w-lg text-foreground/70">
              {product.tagline}.
            </Text>
            <div className="flex flex-row flex-wrap items-center justify-center gap-4">
              <AgentFirstActions trackingName={`product_${product.slug}_cta`} />
            </div>
          </div>
        </section>
      </PageLayout>
    </MarketingEntrance>
  );
}
