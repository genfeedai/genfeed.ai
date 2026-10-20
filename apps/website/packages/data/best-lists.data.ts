import { type Competitor, getCompetitorBySlug } from '@data/competitors.data';

export interface BestList {
  slug: string;
  title: string;
  heading: string;
  description: string;
  intro: string;
  criteria: string[];
  genfeedSummary: string;
  genfeedBestFor: string;
  competitorSlugs: string[];
  notCompared?: string;
}

export interface BestListEntry {
  competitor: Competitor;
  position: number;
}

export const BEST_LISTS: BestList[] = [
  {
    competitorSlugs: ['postiz'],
    criteria: [
      'Licence and source access: can you read, run and change the code?',
      'Whether it generates media and copy or only schedules what you made',
      'Effort to self-host and what you pay for outside the software',
      'Agent access: MCP, API and CLI',
    ],
    description:
      'Open-source AI tools for creating and publishing content: what each does, how it is licensed, and when to pick it. Compare Genfeed and Postiz.',
    genfeedBestFor:
      'You want generation, human review, publishing and analytics in one open-source stack you can self-host.',
    genfeedSummary:
      'Open-source content agent under AGPL-3.0. It generates images, video, text, voice and audio with your own provider keys, queues drafts for review, publishes to connected channels, and is reachable over MCP, a CLI and a REST API. The Community build runs with Docker Compose from the same source as the hosted product.',
    heading: 'Best open-source AI content tools',
    intro:
      'Most AI content tools are closed SaaS. These are the open-source options we compared, with the licence, what each one is built for, and when it is the better pick.',
    notCompared:
      'Other open-source schedulers, such as Mixpost, exist. We have not compared them in depth, so they are not ranked here.',
    slug: 'open-source-ai-content-tools',
    title: 'Best Open-Source AI Content Tools | Genfeed',
  },
  {
    competitorSlugs: [
      'buffer',
      'jasper',
      'canva',
      'higgsfield',
      'postiz',
      'opus-clip',
    ],
    criteria: [
      'What it creates: captions and text, images, video, or all three',
      'Whether publishing and scheduling are built in',
      'Review step before anything goes live',
      'Pricing model: seats, plans or pay per output',
    ],
    description:
      'AI social media content generators compared by what they create, whether they publish, and when each one fits. Genfeed, Buffer, Jasper, Canva and more.',
    genfeedBestFor:
      'You want the post, the media and a reviewed publish step in one place, with the option to self-host.',
    genfeedSummary:
      'One workspace for the draft, the image or video, a human review, and scheduling to connected channels. Free to start with pay-per-output credits, or self-host the open-source Community build.',
    heading: 'Best AI social media content generators',
    intro:
      'Some tools write captions, some make visuals, some only schedule. This guide groups them by the job they do and links to our side-by-side comparison for each.',
    slug: 'ai-social-media-content-generators',
    title: 'Best AI Social Media Content Generators | Genfeed',
  },
  {
    competitorSlugs: [
      'runway',
      'higgsfield',
      'capcut',
      'invideo',
      'pictory',
      'lumen5',
      'heygen',
      'argil',
      'arcads',
      'opus-clip',
    ],
    criteria: [
      'Generation from a prompt, an article, a script or existing footage',
      'Avatars and voice if you need a presenter',
      'Editing depth versus speed',
      'Whether the video can be reviewed and published from the same tool',
    ],
    description:
      'AI video tools for social content compared by source material, avatars, editing depth and publishing. Genfeed, Runway, CapCut, HeyGen and more.',
    genfeedBestFor:
      'You need video alongside images and posts, and want it reviewed and published from the same workspace.',
    genfeedSummary:
      'Generates video next to images, text and voice, keeps assets in a library, and carries the result through review and scheduling. It is a content workspace first, not a timeline editor.',
    heading: 'Best AI video tools for social content',
    intro:
      'Video tools split into generators, editors, avatar presenters and clip extractors. Pick by the source material you already have and where the video has to go next.',
    slug: 'ai-video-tools-for-social-content',
    title: 'Best AI Video Tools for Social Content | Genfeed',
  },
];

export function getBestList(slug: string): BestList | undefined {
  return BEST_LISTS.find((list) => list.slug === slug);
}

export function getAllBestListSlugs(): string[] {
  return BEST_LISTS.map((list) => list.slug);
}

export function getBestListEntries(list: BestList): BestListEntry[] {
  const entries: BestListEntry[] = [];
  for (const slug of list.competitorSlugs) {
    const competitor = getCompetitorBySlug(slug);
    if (competitor) {
      entries.push({ competitor, position: entries.length + 2 });
    }
  }
  return entries;
}
