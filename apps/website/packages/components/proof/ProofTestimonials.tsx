import { getApprovedTestimonials } from '@data/testimonials.data';
import SectionHeader from '@ui/marketing/SectionHeader';
import {
  NeuralGrid,
  NeuralGridItem,
  WebSection,
} from '@web-components/content/NeuralGrid';

interface ProofTestimonialsProps {
  className?: string;
  context?: 'landing' | 'pricing';
}

const TESTIMONIAL_COPY = {
  landing: {
    description: 'Every quote is tied to the number behind it.',
    title: 'What customers say.',
  },
  pricing: {
    description: 'Every quote is tied to the number behind it.',
    title: 'What teams get out of it.',
  },
} as const;

/**
 * Renders nothing until a customer approves a quote for public use. Never render
 * placeholder slots: an empty proof rail advertises the absence of customers,
 * and inventing quotes to fill it is not an option.
 */
export default function ProofTestimonials({
  className,
  context = 'landing',
}: ProofTestimonialsProps): React.ReactElement | null {
  const approvedTestimonials = getApprovedTestimonials();

  if (approvedTestimonials.length === 0) {
    return null;
  }

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
        {approvedTestimonials.map((testimonial) => (
          <NeuralGridItem
            key={testimonial.id}
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
        ))}
      </NeuralGrid>
    </WebSection>
  );
}
