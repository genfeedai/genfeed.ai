import { getRelatedProducts, type Product } from '@data/products.data';
import { ButtonVariant } from '@genfeedai/enums';
import { EnvironmentService } from '@services/core/environment.service';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { VStack } from '@ui/layout/stack';
import EditorialPoster from '@ui/marketing/EditorialPoster';
import HeroProofRail from '@ui/marketing/HeroProofRail';
import { Button } from '@ui/primitives/button';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import ButtonRequestAccess from '@web-components/buttons/request-access/button-request-access/ButtonRequestAccess';
import PageLayout from '@web-components/PageLayout';
import Link from 'next/link';
import { FaCheck, FaGithub } from 'react-icons/fa6';
import { HiXMark } from 'react-icons/hi2';

function GitHubLink({
  href,
  children,
  variant = ButtonVariant.OUTLINE,
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: ButtonVariant;
  className?: string;
}) {
  return (
    <Button variant={variant} asChild className={className}>
      <Link href={href} target="_blank" rel="noopener noreferrer">
        <FaGithub className="w-5 h-5" />
        {children}
      </Link>
    </Button>
  );
}

export default function ProductPage({ product }: { product: Product }) {
  const relatedProducts = getRelatedProducts(product.slug);

  return (
    <PageLayout
      title={product.name}
      description={product.description}
      heroActions={
        <div className="flex flex-col items-start gap-3 sm:flex-row">
          {product.status && product.githubUrl ? (
            <>
              <ButtonRequestAccess label={product.cta} />
              <GitHubLink
                href={product.githubUrl}
                variant={ButtonVariant.GHOST}
              >
                View Source
              </GitHubLink>
            </>
          ) : product.githubUrl ? (
            <GitHubLink
              href={product.githubUrl}
              className="h-12 px-6 text-lg uppercase font-bold"
            >
              View on GitHub
            </GitHubLink>
          ) : (
            <ButtonRequestAccess label={product.cta} />
          )}
        </div>
      }
      heroDetails={
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{product.category}</Badge>
          {product.status ? (
            <Badge variant="warning" className="capitalize">
              {product.status.replace('-', ' ')}
            </Badge>
          ) : null}
        </div>
      }
      heroProof={
        <HeroProofRail
          title="Why teams switch"
          items={product.benefits.slice(0, 3).map((benefit) => ({
            label: benefit.problem,
            value: benefit.solution,
          }))}
        />
      }
      heroVisual={
        <EditorialPoster
          eyebrow={product.tagline}
          title={product.headline}
          detail={product.description}
          items={product.features.slice(0, 4).map((feature) => ({
            label: feature.title,
            value: feature.description,
          }))}
          footer={
            <>
              <span>{product.category}</span>
              <span>{product.pricing.recommended} plan recommended</span>
            </>
          }
        />
      }
    >
      <section className="max-w-6xl mx-auto pb-20">
        <Heading size="2xl" className="text-center mb-12">
          Key Features
        </Heading>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {product.features.map((feature) => (
            <Card
              key={feature.title}
              label={feature.title}
              description={feature.description}
            >
              <div className="text-4xl mb-2">{feature.icon}</div>
            </Card>
          ))}
        </div>
      </section>

      {product.librarySections && product.librarySections.length > 0 && (
        <section className="max-w-6xl mx-auto pb-20">
          <Heading size="2xl" className="text-center mb-12">
            Agent Library
          </Heading>
          <div className="space-y-8">
            {product.librarySections.map((section) => (
              <Card key={section.title} label={section.title}>
                <div className="space-y-6">
                  {section.description ? (
                    <Text as="p" color="muted">
                      {section.description}
                    </Text>
                  ) : null}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {section.agents.map((agent) => (
                      <div
                        key={agent.name}
                        className="border border-border bg-background p-4"
                      >
                        <Text weight="bold" className="mb-2">
                          {agent.name}
                        </Text>
                        <Text as="p" size="sm" color="muted">
                          {agent.description}
                        </Text>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="max-w-6xl mx-auto pb-20">
        <Heading size="2xl" className="text-center mb-12">
          Problems We Solve
        </Heading>
        <VStack gap={6}>
          {product.benefits.map((benefit) => (
            <Card key={benefit.problem}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <div className="flex items-start gap-2 mb-2">
                    <HiXMark className="w-6 h-6 text-error mt-1 flex-shrink-0" />
                    <Text weight="bold" className="text-error">
                      Problem
                    </Text>
                  </div>
                  <Text as="p" color="muted" className="ml-8">
                    {benefit.problem}
                  </Text>
                </div>
                <div>
                  <div className="flex items-start gap-2 mb-2">
                    <FaCheck className="w-6 h-6 text-success mt-1 flex-shrink-0" />
                    <Text weight="bold" className="text-success">
                      Solution
                    </Text>
                  </div>
                  <Text as="p" color="muted" className="ml-8">
                    {benefit.solution}
                  </Text>
                </div>
              </div>
            </Card>
          ))}
        </VStack>
      </section>

      <section className="max-w-6xl mx-auto pb-20">
        <Heading size="2xl" className="text-center mb-12">
          Use Cases
        </Heading>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {product.useCases.map((useCase) => (
            <Card
              key={useCase.title}
              label={useCase.title}
              description={useCase.description}
            >
              <div className="bg-background p-4">
                <Text as="p" size="sm" className="italic">
                  {useCase.example}
                </Text>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto pb-20">
        <Card label="Perfect For">
          <VStack gap={2}>
            {product.targetAudience.map((audience) => (
              <li key={audience} className="flex items-start gap-2 list-none">
                <FaCheck className="w-4 h-4 text-success mt-1 flex-shrink-0" />
                <span>{audience}</span>
              </li>
            ))}
          </VStack>
        </Card>
      </section>

      {product.integrations && product.integrations.length > 0 && (
        <section className="max-w-4xl mx-auto pb-20">
          <Card label="Integrations">
            <div className="flex flex-wrap justify-center gap-4">
              {product.integrations.map((integration) => (
                <Badge key={integration}>{integration}</Badge>
              ))}
            </div>
          </Card>
        </section>
      )}

      <section className="max-w-4xl mx-auto pb-20">
        <Card className="bg-inv text-inv-fg" bodyClassName="text-center">
          <Heading size="2xl" className="mb-2">
            Recommended Plan
          </Heading>
          <div className="text-4xl font-bold mb-4">
            {product.pricing.recommended}
          </div>
          <Text as="p" size="lg" className="mb-6 text-inv-fg/70">
            {product.pricing.why}
          </Text>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {product.status && product.githubUrl ? (
              <>
                <ButtonRequestAccess
                  label={product.cta}
                  variant={ButtonVariant.DEFAULT}
                  className="h-12 px-6 text-lg uppercase"
                />
                <Button
                  variant={ButtonVariant.OUTLINE}
                  asChild
                  className="border-inv-fg/20 hover:border-inv-fg/40 hover:bg-inv-fg/5 h-12 px-6 text-lg uppercase"
                >
                  <Link
                    href={product.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <FaGithub className="w-5 h-5" />
                    View Source
                  </Link>
                </Button>
              </>
            ) : product.githubUrl ? (
              <Button
                variant={ButtonVariant.OUTLINE}
                asChild
                className="border-inv-fg/20 hover:border-inv-fg/40 hover:bg-inv-fg/5 h-12 px-6 text-lg uppercase"
              >
                <Link
                  href={product.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FaGithub className="w-5 h-5" />
                  View on GitHub
                </Link>
              </Button>
            ) : (
              <>
                <ButtonRequestAccess
                  label={product.cta}
                  variant={ButtonVariant.DEFAULT}
                  className="h-12 px-6 text-lg uppercase"
                />
                <Button
                  variant={ButtonVariant.OUTLINE}
                  asChild
                  className="border-inv-fg/20 hover:border-inv-fg/40 hover:bg-inv-fg/5 h-12 px-6 text-lg"
                >
                  <Link href="/pricing">View All Pricing</Link>
                </Button>
              </>
            )}
          </div>
        </Card>
      </section>

      {relatedProducts.length > 0 && (
        <section className="max-w-6xl mx-auto pb-20">
          <Heading size="2xl" className="text-center mb-12">
            You Might Also Like
          </Heading>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {relatedProducts.map((relatedProduct) => (
              <Link key={relatedProduct.slug} href={`/${relatedProduct.slug}`}>
                <Card
                  className="hover:shadow-2xl transition-shadow h-full"
                  label={relatedProduct.name}
                  description={relatedProduct.tagline}
                  actions={
                    <span className="text-primary hover:underline">
                      Learn More →
                    </span>
                  }
                >
                  <div className="text-4xl mb-2">{relatedProduct.icon}</div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="max-w-4xl mx-auto pb-20">
        <Card bodyClassName="text-center">
          <Heading size="2xl" className="mb-4">
            Ready to Get Started with {product.name}?
          </Heading>
          <Text as="p" color="muted" className="mb-6">
            {product.status && product.githubUrl
              ? `Join the ${product.status} program and help shape the future of ${product.name}.`
              : product.githubUrl
                ? 'Join thousands of creators building the future of AI content.'
                : 'Join thousands of creators using Genfeed to generate and publish AI content at scale.'}
          </Text>
          <div className="flex flex-col sm:flex-row items-center gap-4 justify-center">
            {product.status && product.githubUrl ? (
              <>
                <ButtonRequestAccess label={product.cta} />
                <GitHubLink
                  href={product.githubUrl}
                  variant={ButtonVariant.GHOST}
                >
                  View Source
                </GitHubLink>
              </>
            ) : product.githubUrl ? (
              <Button asChild className="h-12 px-6 text-lg uppercase font-bold">
                <Link
                  href={product.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FaGithub className="w-5 h-5" />
                  View on GitHub →
                </Link>
              </Button>
            ) : (
              <Link
                href={`${EnvironmentService.apps.app}/sign-up`}
                className="text-primary hover:underline text-lg"
              >
                {product.cta} →
              </Link>
            )}
          </div>
        </Card>
      </section>
    </PageLayout>
  );
}
