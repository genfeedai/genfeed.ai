import { getUseCasePresetPages } from '@data/use-case-presets.data';
import { getUseCaseAudienceName, type UseCase } from '@data/use-cases.data';
import { getPlanLabel } from '@genfeedai/pricing';
import { PresetCard } from '@public/presets/presets-content';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import AgentFirstActions from '@web-components/buttons/agent-first-actions/AgentFirstActions';
import HeroProofRail from '@web-components/marketing/HeroProofRail';
import PageLayout from '@web-components/PageLayout';
import { Check, X } from 'lucide-react';
import Link from 'next/link';

export default function UseCasesContent({ useCase }: { useCase: UseCase }) {
  const recommendedPlan = getPlanLabel(useCase.pricing.recommended);
  const presets = getUseCasePresetPages(useCase);

  return (
    <PageLayout
      title={useCase.title}
      description={useCase.description}
      variant="proof"
      compact
      heroActions={
        <>
          <AgentFirstActions trackingName="use_case_hero_click" />
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
            { label: 'Recommended plan', value: recommendedPlan },
            {
              label: 'Expected outcome',
              value: useCase.results[0] ?? 'Faster execution',
            },
          ]}
        />
      }
    >
      <section className="max-w-6xl mx-auto pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-foreground/10">
          <div className="bg-background p-8">
            <Heading as="h3" className="text-sm font-semibold mb-6">
              Problems
            </Heading>
            <ul className="space-y-4">
              {useCase.painPoints.map((pain: string) => (
                <li key={pain} className="flex items-start gap-3">
                  <X className="size-4 text-destructive mt-0.5 shrink-0" />
                  <Text className="text-sm text-foreground/70">{pain}</Text>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-background p-8">
            <Heading as="h3" className="text-sm font-semibold mb-6">
              Solutions
            </Heading>
            <ul className="space-y-4">
              {useCase.solutions.map((solution: string) => (
                <li key={solution} className="flex items-start gap-3">
                  <Check className="size-4 text-success mt-0.5 shrink-0" />
                  <Text className="text-sm text-foreground/70">{solution}</Text>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="max-w-4xl mx-auto pb-20">
        <Heading as="h2" className="text-3xl font-semibold text-center mb-10">
          How it works
        </Heading>
        <div className="gen-card-spotlight">
          {useCase.workflow.map((step, index) => (
            <div
              key={step.step}
              className={`flex items-start gap-5 p-6 ${index > 0 ? 'border-t border-foreground/5' : ''}`}
            >
              <div className="shrink-0 size-8 flex items-center justify-center bg-foreground/10 text-sm font-semibold text-foreground/50">
                {step.step}
              </div>
              <div>
                <Heading as="h4" className="font-semibold mb-1">
                  {step.title}
                </Heading>
                <Text className="text-sm text-foreground/60">
                  {step.description}
                </Text>
                <Text className="text-sm text-foreground/60 mt-1">
                  {step.example}
                </Text>
              </div>
            </div>
          ))}
        </div>
      </section>

      {presets.length > 0 ? (
        <section className="max-w-6xl mx-auto pb-20">
          <Heading as="h2" className="text-3xl font-semibold text-center mb-3">
            Presets for {getUseCaseAudienceName(useCase)}
          </Heading>
          <Text as="p" className="mb-10 text-center text-foreground/70">
            One step from a brief to a finished piece. Each shows a real result.
          </Text>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {presets.map((page) => (
              <PresetCard key={page.key} page={page} />
            ))}
          </ul>
          <Text as="p" className="mt-6 text-center text-sm text-foreground/70">
            <Link href="/presets" className="link">
              Every preset
            </Link>
          </Text>
        </section>
      ) : null}

      {useCase.results.length > 0 && (
        <section className="max-w-4xl mx-auto pb-20">
          <Heading as="h2" className="text-3xl font-semibold text-center mb-10">
            Results
          </Heading>
          <div className="grid grid-cols-1 gap-px bg-foreground/10 md:grid-cols-2">
            {useCase.results.map((result) => (
              <div
                key={result}
                className="flex items-start gap-3 bg-background p-5"
              >
                <Check className="size-4 text-success mt-0.5 shrink-0" />
                <Text className="text-sm text-foreground/70">{result}</Text>
              </div>
            ))}
          </div>
        </section>
      )}

      {useCase.relatedLink ? (
        <section className="max-w-4xl mx-auto pb-12">
          <Text className="text-center text-foreground/70">
            {useCase.relatedLink.description}{' '}
            <Link href={useCase.relatedLink.href} className="link">
              {useCase.relatedLink.label}
            </Link>
          </Text>
        </section>
      ) : null}

      <section className="max-w-4xl mx-auto pb-20">
        <div className="gen-card-spotlight p-6 sm:p-10 text-center">
          <Heading as="h3" className="text-3xl font-semibold mb-2">
            {recommendedPlan}
          </Heading>
          <Text className="text-foreground/70 mb-6">{useCase.pricing.why}</Text>
          <div className="flex flex-row flex-wrap items-center justify-center gap-4">
            <AgentFirstActions trackingName="use_case_cta_click" />
          </div>
          <Link href="/pricing" className="link mt-4 block">
            View All Pricing
          </Link>
        </div>
      </section>
    </PageLayout>
  );
}
