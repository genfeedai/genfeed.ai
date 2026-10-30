export interface Testimonial {
  /** Name and company exactly as the customer approved them for public use. */
  attribution: string;
  id: string;
  /** What the metric measures, e.g. "60-day engagement lift". */
  metricLabel: string;
  /** The verified number behind the quote, e.g. "+38%". */
  metricValue: string;
  quote: string;
  role: string;
}

/**
 * Only quotes a customer has approved in writing, each tied to a metric we can
 * evidence. Empty until the first one clears approval: every surface that reads
 * this renders nothing rather than a placeholder.
 */
export const testimonials: Testimonial[] = [];

export function getApprovedTestimonials(limit = 3): Testimonial[] {
  return testimonials.slice(0, limit);
}
