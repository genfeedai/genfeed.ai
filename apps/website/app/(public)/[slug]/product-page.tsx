import { getRelatedProducts, type Product } from '@data/products.data';
import { ButtonVariant } from '@genfeedai/enums';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { VStack } from '@ui/layout/stack';
import EditorialPoster from '@ui/marketing/EditorialPoster';
import HeroProofRail from '@ui/marketing/HeroProofRail';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import ButtonRequestAccess from '@web-components/buttons/request-access/button-request-access/ButtonRequestAccess';
import PageLayout from '@web-components/PageLayout';
import Link from 'next/link';
import { FaCheck } from 'react-icons/fa6';
import { GitHubLink } from './github-link';
import ProductAgentLibrary from './product-agent-library';
import ProductBenefits from './product-benefits';
import ProductFinalCTA from './product-final-cta';
import ProductPricingCTA from './product-pricing-cta';

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
        <ProductAgentLibrary librarySections={product.librarySections} />
      )}

      <ProductBenefits benefits={product.benefits} />

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
                <FaCheck className="size-4 text-success mt-1 flex-shrink-0" />
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

      <ProductPricingCTA
        cta={product.cta}
        githubUrl={product.githubUrl}
        pricing={product.pricing}
        status={product.status}
      />

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

      <ProductFinalCTA
        cta={product.cta}
        githubUrl={product.githubUrl}
        name={product.name}
        status={product.status}
      />
    </PageLayout>
  );
}
