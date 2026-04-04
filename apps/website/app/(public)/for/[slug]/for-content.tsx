import type { UseCase } from '@data/use-cases.data';
import Card from '@ui/card/Card';
import EditorialPoster from '@ui/marketing/EditorialPoster';
import HeroProofRail from '@ui/marketing/HeroProofRail';
import ButtonRequestAccess from '@web-components/buttons/request-access/button-request-access/ButtonRequestAccess';
import PageLayout from '@web-components/PageLayout';
import Link from 'next/link';
import { FaCheck } from 'react-icons/fa6';
import { HiXMark } from 'react-icons/hi2';

export default function ForContent({ useCase }: { useCase: UseCase }) {
  return (
    <PageLayout
      title={useCase.title}
      description={useCase.description}
      variant="proof"
      heroActions={
        <>
          <ButtonRequestAccess label={useCase.cta} />
          <Link href="/pricing" className="link block self-center">
            View All Pricing
          </Link>
        </>
      }
      heroProof={
        <HeroProofRail
          title="Audience fit"
          items={[
            { label: 'Built for', value: useCase.audience },
            { label: 'Recommended plan', value: useCase.pricing.recommended },
            {
              label: 'Primary result',
              value: useCase.results[0] ?? 'Higher output',
            },
          ]}
        />
      }
      heroVisual={
        <EditorialPoster
          eyebrow={useCase.subtitle}
          title={useCase.headline}
          detail={useCase.description}
          items={useCase.workflow.slice(0, 3).map((step) => ({
            label: `Step ${step.step}`,
            value: step.title,
          }))}
        />
      }
    >
      <section className="max-w-6xl mx-auto pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card label="Problems">
            <ul className="space-y-2">
              {useCase.painPoints.map((pain: string) => (
                <li key={pain} className="flex items-start gap-2">
                  <HiXMark className="w-4 h-4 text-error mt-1 flex-shrink-0" />
                  <span className="text-sm">{pain}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card label="Solutions">
            <ul className="space-y-2">
              {useCase.solutions.map((solution: string) => (
                <li key={solution} className="flex items-start gap-2">
                  <FaCheck className="w-4 h-4 text-success mt-1 flex-shrink-0" />
                  <span className="text-sm">{solution}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      <section className="max-w-4xl mx-auto pb-20">
        <Card bodyClassName="text-center">
          <div className="text-3xl font-bold text-primary mb-2">
            {useCase.pricing.recommended}
          </div>
          <p className="text-muted-foreground mb-6">{useCase.pricing.why}</p>
          <ButtonRequestAccess />
          <Link href="/pricing" className="link mt-4 block">
            View All Pricing
          </Link>
        </Card>
      </section>
    </PageLayout>
  );
}
