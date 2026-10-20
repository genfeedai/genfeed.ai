import { type BestList, getBestListEntries } from '@data/best-lists.data';

const WEBSITE_URL = 'https://genfeed.ai';

export function buildBestListJsonLd(list: BestList) {
  const entries = getBestListEntries(list);

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: [
      {
        '@type': 'ListItem',
        name: 'Genfeed',
        position: 1,
        url: WEBSITE_URL,
      },
      ...entries.map(({ competitor, position }) => ({
        '@type': 'ListItem',
        name: competitor.name,
        position,
        url: `${WEBSITE_URL}/vs/${competitor.slug}`,
      })),
    ],
    name: list.heading,
    url: `${WEBSITE_URL}/best/${list.slug}`,
  };
}

export function buildBestListFaqJsonLd(list: BestList) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `${list.genfeedSummary} Choose Genfeed when: ${list.genfeedBestFor}`,
        },
        name: `Where does Genfeed fit in "${list.heading.toLowerCase()}"?`,
      },
      ...getBestListEntries(list).map(({ competitor }) => ({
        '@type': 'Question',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `${competitor.tagline}. Choose ${competitor.name} when: ${competitor.whenToUseCompetitor}.`,
        },
        name: `When is ${competitor.name} the better choice?`,
      })),
    ],
  };
}
