import {
  caseStudyProofSlots,
  getApprovedCaseStudyTestimonials,
} from '@data/case-studies.data';
import { cn } from '@helpers/formatting/cn/cn.util';
import SectionHeader from '@ui/marketing/SectionHeader';
import {
  NeuralGrid,
  NeuralGridItem,
  WebSection,
} from '@web-components/content/NeuralGrid';

interface ProofTestimonialsProps {
  className?: string;
  context?: 'case-studies' | 'landing' | 'pricing';
}

const TESTIMONIAL_COPY = {
  'case-studies': {
    description:
      'These slots only become customer proof after consent, metric capture, draft approval, and publish approval.',
    title: 'Approved proof slots.',
  },
  landing: {
    description:
      'Reserved for permissioned customer receipts tied to measured outcomes, not padded claims.',
    title: 'Proof slots are ready for real receipts.',
  },
  pricing: {
    description:
      'Pricing proof will show approved quotes with the metric behind them once the first customer receipts clear review.',
    title: 'Customer proof, gated by approval.',
  },
} as const;

export default function ProofTestimonials({
  className,
  context = 'landing',
}: ProofTestimonialsProps): React.ReactElement {
  const approvedTestimonials = getApprovedCaseStudyTestimonials();
  const hasApprovedTestimonials = approvedTestimonials.length > 0;
  const copy = TESTIMONIAL_COPY[context];

  return (
    <WebSection
      bg={context === 'pricing' ? 'bordered' : 'default'}
      className={className}
      maxWidth="xl"
      py="md"
    >
      <SectionHeader
        className="[&_h2]:text-5xl mb-4"
        description={copy.description}
        title={copy.title}
      />

      <NeuralGrid columns={3}>
        {hasApprovedTestimonials
          ? approvedTestimonials.map((testimonial) => (
              <NeuralGridItem
                key={testimonial.sourceCaseStudySlug}
                className="flex flex-col gap-5"
                padding="lg"
                tierLabel={testimonial.metricLabel}
              >
                <p className="text-lg font-medium leading-8 text-surface">
                  &ldquo;{testimonial.quote}&rdquo;
                </p>
                <div className="mt-auto border-t border-edge/5 pt-5">
                  <div className="text-sm font-semibold text-surface">
                    {testimonial.attribution}
                  </div>
                  <div className="mt-1 text-sm text-surface/55">
                    {testimonial.role}
                  </div>
                  <div className="mt-4 text-xs font-bold uppercase tracking-widest text-success">
                    {testimonial.metricValue}
                  </div>
                </div>
              </NeuralGridItem>
            ))
          : caseStudyProofSlots.map((slot) => (
              <NeuralGridItem
                key={slot.label}
                className={cn(
                  'flex min-h-72 flex-col gap-5',
                  'border-dashed border-edge/20 bg-fill/[0.015]',
                )}
                padding="lg"
                tierLabel={slot.label}
              >
                <div>
                  <h3 className="mb-2 text-xl font-semibold text-surface">
                    {slot.title}
                  </h3>
                  <p className="text-sm leading-6 text-surface/62">
                    {slot.description}
                  </p>
                </div>
                <div className="mt-auto border-t border-edge/5 pt-5">
                  <div className="text-xs font-bold uppercase tracking-widest text-surface/45">
                    {slot.placement}
                  </div>
                  <div className="mt-3 text-sm font-semibold text-surface">
                    {slot.metricPrompt}
                  </div>
                  <div className="mt-1 text-sm text-surface/55">
                    Reserved for approved customer proof
                  </div>
                  <div className="mt-4 text-xs font-bold uppercase tracking-widest text-warning">
                    Not public proof yet
                  </div>
                </div>
              </NeuralGridItem>
            ))}
      </NeuralGrid>
    </WebSection>
  );
}
