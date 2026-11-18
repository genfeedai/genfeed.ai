import { INTEGRATION_CTA, type Integration } from '@data/integrations.data';
import Card from '@ui/card/Card';
import ButtonRequestAccess from '@web-components/buttons/request-access/button-request-access/ButtonRequestAccess';
import HeroProofRail from '@web-components/marketing/HeroProofRail';
import PageLayout from '@web-components/PageLayout';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

export default function IntegrationContent({
  integration,
}: {
  integration: Integration;
}) {
  const heroProof = useMemo(
    () => (
      <HeroProofRail
        title="What it does"
        items={[
          { label: 'Formats', value: integration.formats },
          ...(integration.results
            ? [{ label: 'Results', value: integration.results }]
            : []),
          { label: 'In short', value: integration.tagline },
        ]}
      />
    ),
    [integration],
  );

  return (
    <PageLayout
      title={integration.name}
      compact
      variant="proof"
      description={integration.description}
      heroActions={
        <>
          <ButtonRequestAccess label={INTEGRATION_CTA} />
          <Link href="/pricing" className="link block self-center">
            View pricing
          </Link>
        </>
      }
      heroProof={heroProof}
    >
      <section className="max-w-6xl mx-auto pb-20">
        <h2 className="text-3xl font-semibold text-center mb-12">Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {integration.features.map((feature: string) => (
            <div key={feature} className="flex items-start gap-3">
              <Check className="size-5 text-success mt-1 flex-shrink-0" />
              <span className="text-lg">{feature}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto pb-20">
        <h2 className="text-3xl font-semibold text-center mb-12">
          How it works
        </h2>
        <div className="space-y-8">
          {integration.workflow.map(
            (
              step: { step: number; title: string; description: string },
              index: number,
            ) => (
              <div key={step.step} className="flex items-start gap-6">
                <div className="flex-shrink-0 size-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-lg">
                  {index + 1}
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-1">{step.title}</h3>
                  <p className="text-muted-foreground">{step.description}</p>
                </div>
              </div>
            ),
          )}
        </div>
      </section>

      <section className="max-w-4xl mx-auto pb-20">
        <Card isCentered>
          <h2 className="text-3xl font-semibold text-primary mb-2">
            {INTEGRATION_CTA}
          </h2>
          <p className="text-muted-foreground mb-6">
            {integration.description}
          </p>
          <ButtonRequestAccess label={INTEGRATION_CTA} />
          <Link href="/pricing" className="link mt-4 block">
            View pricing
          </Link>
        </Card>
      </section>
    </PageLayout>
  );
}
