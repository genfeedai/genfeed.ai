import {
  caseStudies,
  caseStudyPipeline,
  getPublishedCaseStudies,
  requiredCaseStudyMetrics,
} from '@data/case-studies.data';
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
import ProofTestimonials from '@web-components/proof/ProofTestimonials';
import Link from 'next/link';
import { HiCheckCircle } from 'react-icons/hi2';

export default function CaseStudiesContent(): React.ReactElement {
  const publishedCaseStudies = getPublishedCaseStudies();
  const templateCaseStudy = caseStudies[0];
  const visibleCaseStudies =
    publishedCaseStudies.length > 0 ? publishedCaseStudies : caseStudies;

  return (
    <PageLayout
      description="A consent-first pipeline for turning early customer outcomes into public receipts: case studies, testimonials, and reusable proof slots."
      heroActions={
        <div className="flex flex-col items-start gap-3 sm:flex-row">
          <Button asChild size={ButtonSize.PUBLIC}>
            <Link href={`/case-studies/${templateCaseStudy.slug}`}>
              Open template
            </Link>
          </Button>
          <Button
            asChild
            size={ButtonSize.PUBLIC}
            variant={ButtonVariant.GHOST}
          >
            <Link href="/pricing">View pricing</Link>
          </Button>
        </div>
      }
      heroProof={
        <HeroProofRail
          items={[
            { label: 'Required flow', value: 'Consent to metrics to approval' },
            { label: 'Metric window', value: 'First 60 days' },
            { label: 'Publish rule', value: 'Approved facts only' },
          ]}
          title="Proof gate"
        />
      }
      heroVisual={
        <EditorialPoster
          detail="Every proof asset moves through the same public-safe review path before it appears on pricing, landing, or case-study pages."
          eyebrow="Social proof pipeline"
          footer={
            <>
              <span>First 10 customers</span>
              <span>Public receipts only</span>
            </>
          }
          items={caseStudyPipeline.slice(0, 4).map((step) => ({
            label: `${step.label} / ${step.title}`,
            value: step.exitCriteria,
          }))}
          title="Turn customer outcomes into reusable proof."
        />
      }
      title="Case studies and social proof pipeline"
      variant="proof"
    >
      <WebSection maxWidth="xl" py="md">
        <SectionHeader
          className="[&_h2]:text-5xl mb-4"
          description="The process keeps customer approval, measured outcomes, and public placement connected so each new receipt can ship without new engineering."
          title="Consent to publish, in five steps."
        />

        <div className="grid gap-px overflow-hidden border border-edge/10 bg-edge/5 lg:grid-cols-5">
          {caseStudyPipeline.map((step) => (
            <div key={step.id} className="bg-background p-5 shadow-border">
              <div className="mb-5 text-xs font-black uppercase tracking-widest text-surface/45">
                {step.label} / {step.owner}
              </div>
              <h3 className="mb-3 text-xl font-semibold text-surface">
                {step.title}
              </h3>
              <p className="text-sm leading-6 text-surface/62">
                {step.description}
              </p>
              <p className="mt-5 border-t border-edge/5 pt-4 text-xs font-medium leading-5 text-surface/55">
                {step.exitCriteria}
              </p>
            </div>
          ))}
        </div>
      </WebSection>

      <WebSection bg="bordered" maxWidth="lg" py="md">
        <SectionHeader
          className="[&_h2]:text-5xl mb-4"
          description="Every case study captures the same three outcome fields before it can power a testimonial slot."
          title="Metrics captured for every receipt."
        />

        <NeuralGrid columns={3}>
          {requiredCaseStudyMetrics.map((metric, index) => (
            <NeuralGridItem
              key={metric}
              padding="lg"
              tierLabel={`Required ${String(index + 1).padStart(2, '0')}`}
            >
              <div className="mb-4 flex size-10 items-center justify-center bg-success/10 text-success">
                <HiCheckCircle className="size-5" />
              </div>
              <h3 className="mb-3 text-xl font-semibold text-surface">
                {metric}
              </h3>
              <p className="text-sm leading-6 text-surface/62">
                Verified before publication and reused as the metric label for
                pricing, landing-page, and case-study proof.
              </p>
            </NeuralGridItem>
          ))}
        </NeuralGrid>
      </WebSection>

      <WebSection maxWidth="xl" py="md">
        <SectionHeader
          className="[&_h2]:text-5xl mb-4"
          description="Published customer stories appear here. Until the first customer clears approval, the template route is visible and explicitly marked as not public proof."
          title="Case-study surface."
        />

        <NeuralGrid columns={3}>
          {visibleCaseStudies.map((caseStudy) => (
            <NeuralGridItem
              key={caseStudy.slug}
              className="flex flex-col gap-5"
              padding="lg"
              tierLabel={caseStudy.statusLabel}
            >
              <div>
                <h3 className="mb-3 text-2xl font-semibold tracking-[-0.02em] text-surface">
                  {caseStudy.headline}
                </h3>
                <p className="text-sm leading-6 text-surface/62">
                  {caseStudy.summary}
                </p>
              </div>
              <div className="mt-auto border-t border-edge/5 pt-5">
                <div className="text-xs font-bold uppercase tracking-widest text-surface/45">
                  {caseStudy.customerType}
                </div>
                <Button
                  asChild
                  className="mt-4"
                  size={ButtonSize.PUBLIC}
                  variant={ButtonVariant.OUTLINE}
                >
                  <Link href={`/case-studies/${caseStudy.slug}`}>
                    View case study
                  </Link>
                </Button>
              </div>
            </NeuralGridItem>
          ))}
        </NeuralGrid>
      </WebSection>

      <ProofTestimonials context="case-studies" />
    </PageLayout>
  );
}
