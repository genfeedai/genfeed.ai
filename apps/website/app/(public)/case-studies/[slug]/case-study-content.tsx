import type { CaseStudy } from '@data/case-studies.data';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import EditorialPoster from '@ui/marketing/EditorialPoster';
import HeroProofRail from '@ui/marketing/HeroProofRail';
import SectionHeader from '@ui/marketing/SectionHeader';
import { Button } from '@ui/primitives/button';
import {
  NeuralGrid,
  NeuralGridItem,
  WebSection,
} from '@web-components/content/NeuralGrid';
import PageLayout from '@web-components/PageLayout';
import Link from 'next/link';
import { FaCheck } from 'react-icons/fa6';

export default function CaseStudyContent({
  caseStudy,
}: {
  caseStudy: CaseStudy;
}): React.ReactElement {
  const isPublicProof =
    caseStudy.status === 'published' && caseStudy.approvedForPublicUse;

  return (
    <PageLayout
      description={caseStudy.summary}
      heroActions={
        <div className="flex flex-col items-start gap-3 sm:flex-row">
          <Button asChild size={ButtonSize.PUBLIC}>
            <Link href="/case-studies">View pipeline</Link>
          </Button>
          <Button
            asChild
            size={ButtonSize.PUBLIC}
            variant={ButtonVariant.GHOST}
          >
            <Link href="/pricing">Compare plans</Link>
          </Button>
        </div>
      }
      heroProof={
        <HeroProofRail
          items={[
            { label: 'Status', value: caseStudy.statusLabel },
            {
              label: caseStudy.metrics[0]?.label ?? 'Metric',
              value: caseStudy.metrics[0]?.value ?? 'Pending',
            },
            { label: 'Consent', value: caseStudy.consentSummary },
          ]}
          title="Receipt status"
        />
      }
      heroVisual={
        <EditorialPoster
          detail={caseStudy.outcomeSummary}
          eyebrow={caseStudy.companyName}
          footer={
            <>
              <span>{caseStudy.customerType}</span>
              <span>{caseStudy.industry}</span>
            </>
          }
          items={caseStudy.metrics.map((metric) => ({
            label: metric.label,
            value: metric.value,
          }))}
          title={caseStudy.headline}
        />
      }
      title={caseStudy.headline}
      variant="proof"
    >
      {!isPublicProof ? (
        <WebSection maxWidth="lg" py="md">
          <div className="border border-warning/20 bg-warning/10 p-6">
            <div className="mb-2 text-xs font-bold uppercase tracking-widest text-warning">
              Template mode
            </div>
            <p className="text-sm leading-6 text-surface/70">
              This page is a publish template, not a customer claim. Replace the
              placeholder fields with approved customer copy and verified
              metrics before switching the case-study status to published.
            </p>
          </div>
        </WebSection>
      ) : null}

      <WebSection maxWidth="xl" py="md">
        <SectionHeader
          className="[&_h2]:text-5xl mb-4"
          description="The same metric fields feed the case-study page and any reusable testimonial cards."
          title="Outcome metrics."
        />

        <NeuralGrid columns={3}>
          {caseStudy.metrics.map((metric) => (
            <NeuralGridItem key={metric.label} padding="lg" tierLabel="Metric">
              <h3 className="mb-3 text-xl font-semibold text-surface">
                {metric.label}
              </h3>
              <div className="mb-4 text-3xl font-semibold tracking-[-0.03em] text-surface">
                {metric.value}
              </div>
              <p className="text-sm leading-6 text-surface/62">
                {metric.captureWindow}
              </p>
              <p className="mt-4 border-t border-edge/5 pt-4 text-xs font-medium leading-5 text-surface/55">
                Evidence required: {metric.evidenceRequired}
              </p>
            </NeuralGridItem>
          ))}
        </NeuralGrid>
      </WebSection>

      <WebSection bg="bordered" maxWidth="lg" py="md">
        <div className="grid gap-px overflow-hidden border border-edge/10 bg-edge/5 md:grid-cols-3">
          {[
            ['Challenge', caseStudy.challenge],
            ['Genfeed workflow', caseStudy.solution],
            ['Outcome', caseStudy.outcomeSummary],
          ].map(([title, body]) => (
            <div key={title} className="bg-background p-6 shadow-border">
              <h2 className="mb-3 text-xl font-semibold text-surface">
                {title}
              </h2>
              <p className="text-sm leading-6 text-surface/62">{body}</p>
            </div>
          ))}
        </div>
      </WebSection>

      <WebSection maxWidth="lg" py="md">
        <SectionHeader
          className="[&_h2]:text-5xl mb-4"
          description="Use these sections to draft the first proof asset without changing page components."
          title="Story workflow."
        />

        <div className="border border-edge/5">
          {caseStudy.workflow.map((step, index) => (
            <div
              className={`flex items-start gap-5 p-6 ${index > 0 ? 'border-t border-edge/5' : ''}`}
              key={step.title}
            >
              <div className="flex size-8 shrink-0 items-center justify-center bg-fill/10 text-sm font-bold text-surface/50">
                {String(index + 1).padStart(2, '0')}
              </div>
              <div>
                <h3 className="mb-1 font-semibold text-surface">
                  {step.title}
                </h3>
                <p className="text-sm leading-6 text-surface/62">
                  {step.description}
                </p>
                <p className="mt-2 text-xs font-medium uppercase tracking-widest text-surface/45">
                  {step.evidence}
                </p>
              </div>
            </div>
          ))}
        </div>
      </WebSection>

      <WebSection bg="bordered" maxWidth="lg" py="md">
        <SectionHeader
          className="[&_h2]:text-5xl mb-4"
          description="All required checks must clear before a testimonial can appear on pricing or landing pages."
          title="Publish checklist."
        />

        <div className="grid gap-px overflow-hidden border border-edge/10 bg-edge/5 md:grid-cols-2">
          {caseStudy.publishChecklist.map((item) => (
            <div
              className="flex items-start gap-3 bg-background p-5 shadow-border"
              key={item.label}
            >
              <FaCheck className="mt-0.5 size-4 shrink-0 text-success" />
              <div>
                <p className="text-sm font-medium text-surface">{item.label}</p>
                <p className="mt-1 text-xs uppercase tracking-widest text-surface/45">
                  {item.required ? 'Required' : 'Optional'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </WebSection>
    </PageLayout>
  );
}
