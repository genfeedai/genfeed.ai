import type { Integration } from '@data/integrations.data';
import Card from '@ui/card/Card';
import EditorialPoster from '@ui/marketing/EditorialPoster';
import HeroProofRail from '@ui/marketing/HeroProofRail';
import ButtonRequestAccess from '@web-components/buttons/request-access/button-request-access/ButtonRequestAccess';
import PageLayout from '@web-components/PageLayout';
import Link from 'next/link';
import { FaCheck } from 'react-icons/fa6';

export default function IntegrationContent({
  integration,
}: {
  integration: Integration;
}) {
  return (
    <PageLayout
      title={integration.name}
      description={integration.description}
      heroActions={
        <>
          <ButtonRequestAccess label={integration.cta} />
          <Link href="/pricing" className="link block self-center">
            View All Pricing
          </Link>
        </>
      }
      heroProof={
        <HeroProofRail
          title="Channel fit"
          items={[
            {
              label: 'Workflow steps',
              value: String(integration.workflow.length),
            },
            {
              label: 'Core features',
              value: String(integration.features.length),
            },
            { label: 'Positioning', value: integration.tagline },
          ]}
        />
      }
      heroVisual={
        <EditorialPoster
          eyebrow={integration.tagline}
          title={`Build for ${integration.name}`}
          detail={integration.description}
          items={integration.workflow.slice(0, 4).map((step) => ({
            label: `Step ${step.step}`,
            value: step.title,
          }))}
          footer={
            <>
              <span>{integration.features.length} workflow advantages</span>
              <span>{integration.cta}</span>
            </>
          }
        />
      }
    >
      <section className="max-w-6xl mx-auto pb-20">
        <h2 className="text-3xl font-bold text-center mb-12">Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {integration.features.map((feature: string) => (
            <div key={feature} className="flex items-start gap-3">
              <FaCheck className="w-5 h-5 text-success mt-1 flex-shrink-0" />
              <span className="text-lg">{feature}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto pb-20">
        <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
        <div className="space-y-8">
          {integration.workflow.map(
            (
              step: { step: number; title: string; description: string },
              index: number,
            ) => (
              <div key={step.step} className="flex items-start gap-6">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
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
        <Card bodyClassName="text-center">
          <h2 className="text-3xl font-bold text-primary mb-2">
            {integration.cta}
          </h2>
          <p className="text-muted-foreground mb-6">
            {integration.description}
          </p>
          <ButtonRequestAccess />
          <Link href="/pricing" className="link mt-4 block">
            View All Pricing
          </Link>
        </Card>
      </section>
    </PageLayout>
  );
}
