import type { Competitor } from '@data/competitors.data';

export function getComparisonFaqEntries(
  competitor: Competitor,
): { answer: string; question: string }[] {
  return [
    {
      answer: `${competitor.whenToUseCompetitor}.`,
      question: `When is ${competitor.name} the better choice than Genfeed?`,
    },
    {
      answer: `${competitor.whenToUseGenFeed}.`,
      question: `When is Genfeed the better choice than ${competitor.name}?`,
    },
    {
      answer: `${competitor.name} pricing: ${competitor.pricing}. Genfeed is free to start with pay-per-output credits, and the open-source Community build is free to self-host under AGPL-3.0.`,
      question: `How does ${competitor.name} pricing compare with Genfeed?`,
    },
  ];
}

export function buildComparisonFaqJsonLd(competitor: Competitor) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: getComparisonFaqEntries(competitor).map(
      ({ answer, question }) => ({
        '@type': 'Question',
        acceptedAnswer: { '@type': 'Answer', text: answer },
        name: question,
      }),
    ),
  };
}
