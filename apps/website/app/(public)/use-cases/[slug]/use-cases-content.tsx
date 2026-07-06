import type { UseCase } from '@data/use-cases.data';
import EditorialPoster from '@ui/marketing/EditorialPoster';
import HeroProofRail from '@ui/marketing/HeroProofRail';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import ButtonRequestAccess from '@web-components/buttons/request-access/button-request-access/ButtonRequestAccess';
import PageLayout from '@web-components/PageLayout';
import Link from 'next/link';
import { FaCheck } from 'react-icons/fa6';
import { HiXMark } from 'react-icons/hi2';

export default function UseCasesContent({ useCase }: { useCase: UseCase }) {
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
          title="Target audience"
          items={[
            { label: 'Built for', value: useCase.audience },
            { label: 'Recommended plan', value: useCase.pricing.recommended },
            {
              label: 'Expected outcome',
              value: useCase.results[0] ?? 'Faster execution',
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
          footer={
            <>
              <span>{useCase.audience}</span>
              <span>{useCase.cta}</span>
            </>
          }
        />
      }
    >
      <section className="max-w-6xl mx-auto pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-edge/5">
          <div className="bg-background p-8">
            <Heading as="h3" className="text-sm font-bold mb-6">
              Problems
            </Heading>
            <ul className="space-y-4">
              {useCase.painPoints.map((pain: string) => (
                <li key={pain} className="flex items-start gap-3">
                  <HiXMark className="size-4 text-error mt-0.5 shrink-0" />
                  <Text className="text-sm text-surface/65">{pain}</Text>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-background p-8">
            <Heading as="h3" className="text-sm font-bold mb-6">
              Solutions
            </Heading>
            <ul className="space-y-4">
              {useCase.solutions.map((solution: string) => (
                <li key={solution} className="flex items-start gap-3">
                  <FaCheck className="size-4 text-success mt-0.5 shrink-0" />
                  <Text className="text-sm text-surface/65">{solution}</Text>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="max-w-4xl mx-auto pb-20">
        <Heading as="h2" className="text-3xl font-bold text-center mb-10">
          How It Works
        </Heading>
        <div className="border border-edge/5">
          {useCase.workflow.map((step, index) => (
            <div
              key={step.step}
              className={`flex items-start gap-5 p-6 ${index > 0 ? 'border-t border-edge/5' : ''}`}
            >
              <div className="shrink-0 size-8 flex items-center justify-center bg-fill/10 text-sm font-bold text-surface/50">
                {step.step}
              </div>
              <div>
                <Heading as="h4" className="font-semibold mb-1">
                  {step.title}
                </Heading>
                <Text className="text-sm text-surface/55">
                  {step.description}
                </Text>
                <Text className="text-sm text-surface/60 mt-1">
                  {step.example}
                </Text>
              </div>
            </div>
          ))}
        </div>
      </section>

      {useCase.results.length > 0 && (
        <section className="max-w-4xl mx-auto pb-20">
          <Heading as="h2" className="text-3xl font-bold text-center mb-10">
            Results
          </Heading>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-edge/5 border border-edge/5">
            {useCase.results.map((result) => (
              <div
                key={result}
                className="flex items-start gap-3 bg-background p-5"
              >
                <FaCheck className="size-4 text-success mt-0.5 shrink-0" />
                <Text className="text-sm text-surface/65">{result}</Text>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="max-w-4xl mx-auto pb-20">
        <div className="border border-edge/5 p-10 text-center">
          <Heading as="h3" className="text-3xl font-bold mb-2">
            {useCase.pricing.recommended}
          </Heading>
          <Text className="text-surface/65 mb-6">{useCase.pricing.why}</Text>
          <ButtonRequestAccess />
          <Link href="/pricing" className="link mt-4 block">
            View All Pricing
          </Link>
        </div>
      </section>
    </PageLayout>
  );
}
