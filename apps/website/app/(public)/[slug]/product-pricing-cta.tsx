import type { Product } from '@data/products.data';
import { ButtonVariant } from '@genfeedai/contracts';
import { GithubIcon } from '@genfeedai/helpers/ui/icons/brands';
import { getPlanLabel } from '@genfeedai/pricing';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import ButtonRequestAccess from '@web-components/buttons/request-access/button-request-access/ButtonRequestAccess';
import Link from 'next/link';

type Props = {
  cta: Product['cta'];
  githubUrl: Product['githubUrl'];
  pricing: Product['pricing'];
  status: Product['status'];
};

export default function ProductPricingCTA({
  cta,
  githubUrl,
  pricing,
  status,
}: Props) {
  return (
    <section className="max-w-4xl mx-auto pb-20">
      <Card
        className="border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)]"
        bodyClassName="text-center"
      >
        <Heading size="2xl" className="mb-2">
          Recommended Plan
        </Heading>
        <div className="text-4xl font-bold mb-4">
          {getPlanLabel(pricing.recommended)}
        </div>
        <Text as="p" size="lg" className="mb-6 text-surface/70">
          {pricing.why}
        </Text>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {status && githubUrl ? (
            <>
              <ButtonRequestAccess
                label={cta}
                variant={ButtonVariant.DEFAULT}
                className="h-12 px-6 text-lg uppercase"
              />
              <Button
                variant={ButtonVariant.SECONDARY}
                asChild
                className="h-12 border-[var(--gen-accent-border)] px-6 text-lg uppercase hover:border-[var(--gen-accent-hover)] hover:bg-[var(--gen-accent-bg)]"
              >
                <Link
                  href={githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <GithubIcon className="size-5" />
                  View Source
                </Link>
              </Button>
            </>
          ) : githubUrl ? (
            <Button
              variant={ButtonVariant.SECONDARY}
              asChild
              className="h-12 border-[var(--gen-accent-border)] px-6 text-lg uppercase hover:border-[var(--gen-accent-hover)] hover:bg-[var(--gen-accent-bg)]"
            >
              <Link href={githubUrl} target="_blank" rel="noopener noreferrer">
                <GithubIcon className="size-5" />
                View on GitHub
              </Link>
            </Button>
          ) : (
            <>
              <ButtonRequestAccess
                label={cta}
                variant={ButtonVariant.DEFAULT}
                className="h-12 px-6 text-lg uppercase"
              />
              <Button
                variant={ButtonVariant.SECONDARY}
                asChild
                className="h-12 border-[var(--gen-accent-border)] px-6 text-lg hover:border-[var(--gen-accent-hover)] hover:bg-[var(--gen-accent-bg)]"
              >
                <Link href="/pricing">View All Pricing</Link>
              </Button>
            </>
          )}
        </div>
      </Card>
    </section>
  );
}
