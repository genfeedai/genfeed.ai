import { describe, expect, it } from 'vitest';
import {
  caseStudies,
  caseStudyPipeline,
  caseStudyProofSlots,
  getAllCaseStudySlugs,
  getApprovedCaseStudyTestimonials,
  getCaseStudyBySlug,
  getPublishedCaseStudies,
  requiredCaseStudyMetrics,
} from './case-studies.data';

describe('case study proof pipeline data', () => {
  it('documents the required consent to publish flow', () => {
    expect(caseStudyPipeline.map((step) => step.id)).toEqual([
      'consent',
      'metrics',
      'draft',
      'approval',
      'publish',
    ]);
  });

  it('requires the outcome metrics from the PRD', () => {
    expect(requiredCaseStudyMetrics).toEqual([
      '60-day engagement lift',
      'Time saved per week',
      'Channels activated',
    ]);
  });

  it('exposes the first case-study template by slug', () => {
    expect(getAllCaseStudySlugs()).toContain('first-customer-proof-template');
    expect(getCaseStudyBySlug('first-customer-proof-template')).toEqual(
      caseStudies[0],
    );
  });

  it('keeps template content out of approved public proof', () => {
    expect(getPublishedCaseStudies()).toEqual([]);
    expect(getApprovedCaseStudyTestimonials()).toEqual([]);
    expect(caseStudies[0].approvedForPublicUse).toBe(false);
    expect(caseStudies[0].testimonial.approvedForPublicUse).toBe(false);
  });

  it('defines reusable proof slots for landing, pricing, and case-study surfaces', () => {
    expect(caseStudyProofSlots.map((slot) => slot.placement)).toEqual([
      'Homepage proof rail',
      'Pricing page',
      'Case-study hub',
    ]);
  });

  it('does not include private-source placeholders in public data', () => {
    const serialized = JSON.stringify({
      caseStudies,
      caseStudyPipeline,
      caseStudyProofSlots,
    }).toLowerCase();

    for (const blockedTerm of [
      'vault',
      'gateway ventures',
      'private strategy',
    ]) {
      expect(serialized).not.toContain(blockedTerm);
    }
  });
});
