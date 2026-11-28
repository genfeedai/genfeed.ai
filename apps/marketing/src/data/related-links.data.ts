import { BEST_LISTS } from '@data/best-lists.data';
import { competitors } from '@data/competitors.data';
import { integrations } from '@data/integrations.data';

import { appProducts, getRelatedAppProducts } from './app-products.data';

/**
 * Links a page offers to its neighbours, in the body of the page.
 *
 * A crawler weighs a page by who links to it, and the footer links to the same
 * handful of hubs from every page, so the pages below those hubs had one link
 * each, from /sitemap (#11619). These links are chosen per page and sit in the
 * content, where a visitor deciding what to read next also finds them.
 *
 * Every family links in a ring: item N links to the next three items, so every
 * item has exactly three inbound links from its siblings whatever the family
 * size, and adding an item to a list needs no change here.
 */

export interface RelatedLink {
  readonly href: string;
  readonly label: string;
  readonly description: string;
}

/** How many siblings each page of a family links to. */
export const RING_SIZE = 3;

/** Fewest links every page of a family must receive from its siblings. */
export const MIN_INBOUND_SIBLINGS = 3;

/** The `count` items that follow `index`, wrapping at the end of the list. */
export function ringNeighbors<T>(
  items: readonly T[],
  index: number,
  count: number = RING_SIZE,
): T[] {
  if (index < 0 || items.length <= 1) {
    return [];
  }
  const size = Math.min(count, items.length - 1);
  return Array.from(
    { length: size },
    (_, offset) => items[(index + offset + 1) % items.length] as T,
  );
}

function dedupe(links: readonly RelatedLink[], self: string): RelatedLink[] {
  const seen = new Set<string>([self]);
  return links.filter((link) => {
    if (seen.has(link.href)) {
      return false;
    }
    seen.add(link.href);
    return true;
  });
}

// --- Comparisons and best lists --------------------------------------------

const ALL_COMPARISONS_LINK: RelatedLink = {
  description: 'Every Genfeed comparison, side by side.',
  href: '/vs',
  label: 'All comparisons',
};

const ALL_BEST_LISTS_LINK: RelatedLink = {
  description: 'Ranked guides to AI content tools.',
  href: '/best',
  label: 'Best AI content tools',
};

export function getComparisonRelatedLinks(slug: string): RelatedLink[] {
  const index = competitors.findIndex((item) => item.slug === slug);
  const lists = BEST_LISTS.filter((list) =>
    list.competitorSlugs.includes(slug),
  ).map(
    (list): RelatedLink => ({
      description: `Where ${competitors[index]?.name ?? 'it'} ranks, and the other tools in the guide.`,
      href: `/best/${list.slug}`,
      label: list.heading,
    }),
  );
  const siblings = ringNeighbors(competitors, index).map(
    (item): RelatedLink => ({
      description: item.tagline,
      href: `/vs/${item.slug}`,
      label: `Genfeed vs ${item.name}`,
    }),
  );
  return dedupe([...lists, ...siblings, ALL_COMPARISONS_LINK], `/vs/${slug}`);
}

export function getBestListRelatedLinks(slug: string): RelatedLink[] {
  const index = BEST_LISTS.findIndex((list) => list.slug === slug);
  const siblings = ringNeighbors(BEST_LISTS, index, BEST_LISTS.length).map(
    (list): RelatedLink => ({
      description: list.description,
      href: `/best/${list.slug}`,
      label: list.heading,
    }),
  );
  return dedupe(
    [...siblings, ALL_BEST_LISTS_LINK, ALL_COMPARISONS_LINK],
    `/best/${slug}`,
  );
}

export function getBestHubRelatedLinks(): RelatedLink[] {
  return [ALL_COMPARISONS_LINK];
}

// --- Platform landing pages and the done-for-you family --------------------

interface LandingEntry {
  readonly slug: string;
  readonly label: string;
  readonly description: string;
  /** Integration page for the same platform, when there is one. */
  readonly integration?: string;
}

const PLATFORM_LANDINGS: readonly LandingEntry[] = [
  {
    description: 'Long-form and Shorts, written and cut by your agent.',
    integration: 'youtube',
    label: 'YouTube',
    slug: 'youtube',
  },
  {
    description: 'Short videos made and queued for your approval.',
    integration: 'tiktok',
    label: 'TikTok',
    slug: 'tiktok',
  },
  {
    description: 'Carousels, Reels and posts in your brand voice.',
    integration: 'instagram',
    label: 'Instagram',
    slug: 'instagram',
  },
  {
    description: 'Posts and documents for your professional audience.',
    integration: 'linkedin',
    label: 'LinkedIn',
    slug: 'linkedin',
  },
  {
    description: 'Posts and video for Pages and groups.',
    integration: 'facebook',
    label: 'Facebook',
    slug: 'facebook',
  },
  {
    description: 'Long arguments and threads, drafted for you to approve.',
    integration: 'x-twitter',
    label: 'X',
    slug: 'x',
  },
  {
    description: 'Short text posts that start conversations.',
    integration: 'threads',
    label: 'Threads',
    slug: 'threads',
  },
  {
    description: 'Pins that keep sending traffic after the day they post.',
    integration: 'pinterest',
    label: 'Pinterest',
    slug: 'pinterest',
  },
];

const DONE_FOR_YOU_LANDINGS: readonly LandingEntry[] = [
  {
    description: 'Content for a founder who has no time to make it.',
    label: 'Founder content',
    slug: 'founder-content',
  },
  {
    description: 'The content around a launch, from teaser to recap.',
    label: 'Launch content',
    slug: 'launch-content',
  },
  {
    description: 'One podcast episode turned into a week of posts.',
    label: 'Podcast to content',
    slug: 'podcast-to-content',
  },
  {
    description: 'A model trained on your face, voice or product.',
    label: 'Custom models',
    slug: 'custom-models',
  },
  {
    description: 'We run the content engine and you approve the posts.',
    label: 'Done-for-you content',
    slug: 'done-for-you',
  },
];

function landingLink(entry: LandingEntry): RelatedLink {
  return {
    description: entry.description,
    href: `/${entry.slug}`,
    label: entry.label,
  };
}

/** Siblings of a landing page: every other page in its family, plus its integration. */
export function getLandingRelatedLinks(slug: string): RelatedLink[] {
  const platform = PLATFORM_LANDINGS.find((entry) => entry.slug === slug);
  if (platform) {
    const integration = integrations.find(
      (item) => item.slug === platform.integration,
    );
    return dedupe(
      [
        ...(integration
          ? [
              {
                description: integration.tagline,
                href: `/integrations/${integration.slug}`,
                label: `${integration.name} integration`,
              },
            ]
          : []),
        ...PLATFORM_LANDINGS.map(landingLink),
      ],
      `/${slug}`,
    );
  }
  if (DONE_FOR_YOU_LANDINGS.some((entry) => entry.slug === slug)) {
    return dedupe(DONE_FOR_YOU_LANDINGS.map(landingLink), `/${slug}`);
  }
  return [];
}

// --- Integrations -----------------------------------------------------------

export function getIntegrationRelatedLinks(slug: string): RelatedLink[] {
  const index = integrations.findIndex((item) => item.slug === slug);
  const landing = PLATFORM_LANDINGS.find((entry) => entry.integration === slug);
  const siblings = ringNeighbors(integrations, index).map(
    (item): RelatedLink => ({
      description: item.tagline,
      href: `/integrations/${item.slug}`,
      label: `${item.name} integration`,
    }),
  );
  return dedupe(
    [
      ...(landing
        ? [
            {
              description: landing.description,
              href: `/${landing.slug}`,
              label: `Genfeed for ${landing.label}`,
            },
          ]
        : []),
      ...siblings,
      {
        description: 'Every channel Genfeed connects to.',
        href: '/integrations',
        label: 'All integrations',
      },
    ],
    `/integrations/${slug}`,
  );
}

// --- App products -----------------------------------------------------------

export function getProductRelatedLinks(slug: string): RelatedLink[] {
  const index = appProducts.findIndex((item) => item.slug === slug);
  const alreadyRelated = new Set(
    getRelatedAppProducts(slug).map((item) => item.slug),
  );
  return dedupe(
    ringNeighbors(appProducts, index)
      .filter((item) => !alreadyRelated.has(item.slug))
      .map(
        (item): RelatedLink => ({
          description: item.tagline,
          href: `/products/${item.slug}`,
          label: item.name,
        }),
      ),
    `/products/${slug}`,
  );
}

// --- Free tools -------------------------------------------------------------

const TOOLS: readonly RelatedLink[] = [
  {
    description: 'Find the model for images, video, writing, voice or music.',
    href: '/tools/ai-model-selector',
    label: 'AI model selector',
  },
  {
    description: "Find a channel's breakout videos.",
    href: '/tools/youtube-outliers',
    label: 'YouTube outlier finder',
  },
  {
    description: 'Turn a public YouTube video into short clips.',
    href: '/tools/youtube-clipper',
    label: 'YouTube clipper',
  },
  {
    description: 'Turn a long video into posts, a script and clips.',
    href: '/tools/youtube-long-form',
    label: 'YouTube long-form to content',
  },
];

export function getToolRelatedLinks(path: string): RelatedLink[] {
  return dedupe(
    [
      ...TOOLS,
      {
        description: 'Every free tool, in one list.',
        href: '/tools',
        label: 'All free tools',
      },
    ],
    path,
  );
}

// --- Standalone pages -------------------------------------------------------

const STANDALONE: Readonly<Record<string, RelatedLink>> = {
  '/about': {
    description: 'Who builds Genfeed and why it is open source.',
    href: '/about',
    label: 'About Genfeed',
  },
  '/benchmark': {
    description: 'How the models behind Genfeed score on real content jobs.',
    href: '/benchmark',
    label: 'Model benchmark',
  },
  '/brand-os': {
    description: 'The design system behind the product.',
    href: '/brand-os',
    label: 'Brand OS',
  },
  '/calendar': {
    description: 'Plan and schedule across every channel.',
    href: '/calendar',
    label: 'Content calendar',
  },
  '/changelog': {
    description: 'What shipped in every release.',
    href: '/changelog',
    label: 'Changelog',
  },
  '/desktop': {
    description: 'Run Genfeed as a native macOS app.',
    href: '/desktop',
    label: 'Desktop app',
  },
  '/developers': {
    description: 'The API, CLI and MCP server, with working examples.',
    href: '/developers',
    label: 'For developers',
  },
  '/docs': {
    description: 'Guides for setting up and running Genfeed.',
    href: '/docs',
    label: 'Documentation',
  },
  '/experts': {
    description: 'Turn interviews and talks into a positioning system.',
    href: '/experts',
    label: 'Brand OS for experts',
  },
  '/extension': {
    description: 'Save and remix content from your browser.',
    href: '/extension',
    label: 'Browser extension',
  },
  '/faq': {
    description: 'Pricing, features and access, answered.',
    href: '/faq',
    label: 'FAQ',
  },
  '/features': {
    description: 'Everything Genfeed makes, plans and publishes.',
    href: '/features',
    label: 'Features',
  },
  '/mobile': {
    description: 'Review and approve posts from your phone.',
    href: '/mobile',
    label: 'Mobile app',
  },
  '/pricing': {
    description: 'Free to start, pay per output.',
    href: '/pricing',
    label: 'Pricing',
  },
  '/research': {
    description: 'Trends, hooks and competitor accounts turned into briefs.',
    href: '/research',
    label: 'Content research',
  },
};

/** Pages that explain what Genfeed does. */
const PRODUCT_TOUR = [
  '/features',
  '/calendar',
  '/research',
  '/brand-os',
  '/experts',
  '/desktop',
] as const;

/** Pages that explain how to run, trust and follow Genfeed. */
const LEARN = [
  '/changelog',
  '/faq',
  '/benchmark',
  '/docs',
  '/developers',
  '/about',
  '/pricing',
] as const;

/** Where Genfeed runs besides the web app. */
const EVERYWHERE = [
  '/features',
  '/desktop',
  '/faq',
  '/mobile',
  '/extension',
  '/docs',
] as const;

function standalone(paths: readonly string[], self: string): RelatedLink[] {
  return dedupe(
    paths.flatMap((path) => {
      const link = STANDALONE[path];
      return link ? [link] : [];
    }),
    self,
  );
}

/**
 * Related pages for a standalone page, by its path. A page belongs to the
 * clusters that list it, and links to every other page in each.
 */
export function getStandaloneRelatedLinks(path: string): RelatedLink[] {
  const clusters: readonly (readonly string[])[] = [
    PRODUCT_TOUR,
    LEARN,
    EVERYWHERE,
  ];
  const cluster = clusters.filter((paths) => paths.includes(path));
  return standalone(cluster.flat(), path);
}

/** Paths a standalone cluster page links to, for the tests that guard the graph. */
export function getStandaloneClusterPaths(): readonly (readonly string[])[] {
  return [PRODUCT_TOUR, LEARN, EVERYWHERE];
}
