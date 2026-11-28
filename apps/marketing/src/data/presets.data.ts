import { fitDescription } from '@data/seo-copy';
import {
  PRESET_CATALOG,
  type PresetCatalogEntry,
} from '@genfeedai/contracts/constants/preset-catalog.constant';
import { presetSlug } from '@genfeedai/contracts/constants/preset-slug.constant';
import type { PresetExample } from '@genfeedai/contracts/interfaces/elements/preset-example.interface';
import { isRecord } from '@genfeedai/utils/data/extract.util';

/**
 * The public preset pages, built from `PRESET_CATALOG` and nothing else: no API
 * call, no second copy of a preset's text. A preset is published only when it
 * carries at least one example, so a page never promises output nobody has
 * seen; the day a preset gets its example in the catalog, its card and page,
 * its sitemap entry and the navigation links appear on the next build.
 */

export type PresetGroupId = 'ads' | 'b2b' | 'video' | 'image' | 'edit';

export interface PresetGroup {
  readonly blurb: string;
  readonly id: PresetGroupId;
  readonly title: string;
  readonly match: (preset: PresetCatalogEntry) => boolean;
}

/** What a preset makes, in the order the hub lists it. The first match wins. */
export const PRESET_GROUPS: readonly PresetGroup[] = [
  {
    blurb: 'Structured video ads with a script you lock in.',
    id: 'ads',
    match: (preset) => preset.kind === 'ad',
    title: 'Video ads',
  },
  {
    blurb: 'Clips and cards for a business feed.',
    id: 'b2b',
    match: (preset) => preset.kind === 'b2b',
    title: 'Business content',
  },
  {
    blurb: 'Short clips for Reels, TikTok and Shorts.',
    id: 'video',
    match: (preset) => preset.type === 'video',
    title: 'Videos',
  },
  {
    blurb: 'Pictures sized for where they go.',
    id: 'image',
    match: (preset) => preset.type === 'image',
    title: 'Images',
  },
  {
    blurb: 'Fix a photo you already have.',
    id: 'edit',
    match: (preset) => preset.type === 'image-edit',
    title: 'Photo edits',
  },
];

export interface PresetRecipeLine {
  readonly body: string;
  readonly title: string;
}

export interface PresetFaqItem {
  readonly answer: string;
  readonly question: string;
}

export interface PresetPage {
  readonly aspectRatio: string | undefined;
  readonly description: string;
  readonly examples: readonly PresetExample[];
  readonly faq: readonly PresetFaqItem[];
  readonly groupId: PresetGroupId;
  readonly groupTitle: string;
  readonly key: string;
  readonly label: string;
  /** The read-only MCP call that returns the preset. */
  readonly mcpCall: string;
  readonly outputType: PresetCatalogEntry['type'];
  readonly recipe: readonly PresetRecipeLine[];
  /** The recipe as one block of text, for the copy control. */
  readonly recipeText: string;
  readonly seoDescription: string;
  readonly seoTitle: string;
  readonly settings: readonly (readonly [string, string])[];
  readonly slug: string;
  /** What to say to an agent connected to Genfeed. */
  readonly agentPrompt: string;
}

/** The part of `values` that holds the preset's own fields. */
function detailOf(preset: PresetCatalogEntry): Record<string, unknown> {
  const values = preset.values as Record<string, unknown>;
  const nested = values.adPreset ?? values.playbook ?? values.cinematicShort;
  return isRecord(nested) ? nested : values;
}

function aspectRatioOf(preset: PresetCatalogEntry): string | undefined {
  const aspect = detailOf(preset).aspectRatio;
  return typeof aspect === 'string' ? aspect : undefined;
}

function recipeOf(preset: PresetCatalogEntry): PresetRecipeLine[] {
  const detail = detailOf(preset);
  const lines: PresetRecipeLine[] = [];
  if (preset.prompt) lines.push({ body: preset.prompt, title: 'Prompt' });
  if (Array.isArray(detail.sections)) {
    for (const section of detail.sections) {
      if (isRecord(section))
        lines.push({
          body: String(section.template),
          title: String(section.title),
        });
    }
  }
  if (typeof detail.hookFormula === 'string')
    lines.push({ body: detail.hookFormula, title: 'Hook' });
  if (Array.isArray(detail.shots)) {
    for (const shot of detail.shots) {
      if (isRecord(shot))
        lines.push({
          body: String(shot.direction ?? shot.action ?? ''),
          title: `Shot: ${String(shot.title)}`,
        });
    }
  }
  for (const field of ['style', 'scene', 'cameraMovement', 'styleByFeel']) {
    const value = detail[field];
    if (typeof value === 'string')
      lines.push({
        body: value,
        title: field === 'styleByFeel' ? 'Style' : field,
      });
  }
  return lines;
}

const OUTPUT_LABEL: Record<PresetCatalogEntry['type'], string> = {
  image: 'Picture',
  'image-edit': 'Edited photo',
  video: 'Video',
};

function settingsOf(preset: PresetCatalogEntry): [string, string][] {
  const detail = detailOf(preset);
  const rows: [string, string][] = [['Output', OUTPUT_LABEL[preset.type]]];
  const aspect = aspectRatioOf(preset);
  if (aspect) rows.push(['Aspect ratio', aspect]);
  if (typeof detail.duration === 'number')
    rows.push(['Length', `${detail.duration} seconds`]);
  if (typeof detail.maxRuntimeSeconds === 'number')
    rows.push(['Length', `up to ${detail.maxRuntimeSeconds} seconds`]);
  if (Array.isArray(detail.allowedModels))
    rows.push(['Models', detail.allowedModels.join(', ')]);
  if (Array.isArray(detail.referenceSlots))
    rows.push([
      'You bring',
      detail.referenceSlots
        .map((slot) => (isRecord(slot) ? String(slot.label) : ''))
        .filter(Boolean)
        .join(', '),
    ]);
  if (detail.speaking === true)
    rows.push(['You bring', 'A script and a voice recording']);
  rows.push(['Preset key', preset.key]);
  return rows;
}

function faqOf(preset: PresetCatalogEntry): PresetFaqItem[] {
  return [
    {
      answer: `${preset.description} Bring the subject; the rest of the recipe is already filled in.`,
      question: `What does the ${preset.label} preset do?`,
    },
    {
      answer:
        'The preset itself costs nothing and its recipe is open source. Running it spends credits, like any other generation.',
      question: `What does the ${preset.label} preset cost?`,
    },
    {
      answer:
        'Yes. The recipe on this page is the open-source definition from the Genfeed catalog. Copy it into any tool and change it.',
      question: 'Can I change the recipe?',
    },
    {
      answer:
        'Yes. Any MCP client connected to Genfeed can read the preset by its key with get_generation_catalog and use it to generate.',
      question: 'Can my agent use it?',
    },
  ];
}

function seoDescriptionOf(preset: PresetCatalogEntry): string {
  return fitDescription(
    `${preset.description} See real examples, copy the recipe and run it.`,
    `See what the ${preset.label} preset makes, copy its full recipe and run it on your brand in Genfeed or from your agent.`,
    `${preset.label} preset from Genfeed: real examples of what it makes, the full recipe to copy, and how to run it from your agent or on your brand.`,
  );
}

function groupOf(preset: PresetCatalogEntry): PresetGroup {
  const group = PRESET_GROUPS.find((candidate) => candidate.match(preset));
  if (!group)
    throw new Error(`Preset ${preset.key} belongs to no preset group`);
  return group;
}

function buildPage(preset: PresetCatalogEntry): PresetPage {
  const group = groupOf(preset);
  const recipe = recipeOf(preset);
  return {
    agentPrompt: `Read the Genfeed preset "${preset.key}", then use it to make a ${preset.label.toLowerCase()} for my brand and save it as a draft.`,
    aspectRatio: aspectRatioOf(preset),
    description: preset.description,
    examples: preset.examples,
    faq: faqOf(preset),
    groupId: group.id,
    groupTitle: group.title,
    key: preset.key,
    label: preset.label,
    mcpCall: `get_generation_catalog(action="preset", key="${preset.key}")`,
    outputType: preset.type,
    recipe,
    recipeText: recipe
      .map((line) => `${line.title}\n${line.body}`)
      .join('\n\n'),
    seoDescription: seoDescriptionOf(preset),
    seoTitle: `${preset.label} prompt and examples`,
    settings: settingsOf(preset),
    slug: presetSlug(preset.label),
  };
}

/** The pages for the presets that have an example, in catalog order. */
export function buildPresetPages(
  catalog: readonly PresetCatalogEntry[] = PRESET_CATALOG,
): PresetPage[] {
  const pages = catalog
    .filter((preset) => preset.examples.length > 0)
    .map(buildPage);
  const seen = new Set<string>();
  for (const page of pages) {
    if (seen.has(page.slug))
      throw new Error(
        `Two presets share the page address /presets/${page.slug}`,
      );
    seen.add(page.slug);
  }
  return pages;
}

const PRESET_PAGES: readonly PresetPage[] = buildPresetPages();

export function getPresetPages(): readonly PresetPage[] {
  return PRESET_PAGES;
}

/** False until the first preset has an example: nothing links to `/presets` before then. */
export function hasPresetPages(): boolean {
  return PRESET_PAGES.length > 0;
}

export function getAllPresetSlugs(): string[] {
  return PRESET_PAGES.map((page) => page.slug);
}

export function getPresetPageBySlug(slug: string): PresetPage | undefined {
  return PRESET_PAGES.find((page) => page.slug === slug);
}

/** The published presets of one group, in catalog order. */
export function getPresetPagesInGroup(
  groupId: PresetGroupId,
  pages: readonly PresetPage[] = PRESET_PAGES,
): PresetPage[] {
  return pages.filter((page) => page.groupId === groupId);
}

/** Other published presets of the same group, for the links at the foot of a page. */
export function getRelatedPresetPages(
  page: PresetPage,
  pages: readonly PresetPage[] = PRESET_PAGES,
): PresetPage[] {
  return pages.filter(
    (other) => other.groupId === page.groupId && other.key !== page.key,
  );
}

const SITE_URL = 'https://genfeed.ai';

function exampleJsonLd(page: PresetPage, example: PresetExample) {
  return example.mediaType === 'video'
    ? {
        '@type': 'VideoObject',
        contentUrl: example.url,
        description: example.alt,
        name: `${page.label} preset example`,
        thumbnailUrl: example.posterUrl,
      }
    : {
        '@type': 'ImageObject',
        contentUrl: example.url,
        description: example.alt,
        name: `${page.label} preset example`,
      };
}

export function buildPresetPageJsonLd(page: PresetPage) {
  const url = `${SITE_URL}/presets/${page.slug}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        description: page.seoDescription,
        isPartOf: { '@type': 'WebSite', name: 'Genfeed', url: SITE_URL },
        name: page.seoTitle,
        url,
      },
      ...page.examples.map((example) => exampleJsonLd(page, example)),
      {
        '@type': 'FAQPage',
        mainEntity: page.faq.map((item) => ({
          '@type': 'Question',
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
          name: item.question,
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            item: `${SITE_URL}/presets`,
            name: 'Presets',
            position: 1,
          },
          { '@type': 'ListItem', item: url, name: page.label, position: 2 },
        ],
      },
    ],
  };
}

export function buildPresetsHubJsonLd(
  pages: readonly PresetPage[] = PRESET_PAGES,
) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        isPartOf: { '@type': 'WebSite', name: 'Genfeed', url: SITE_URL },
        name: 'Genfeed presets',
        url: `${SITE_URL}/presets`,
      },
      {
        '@type': 'ItemList',
        itemListElement: pages.map((page, index) => ({
          '@type': 'ListItem',
          name: page.label,
          position: index + 1,
          url: `${SITE_URL}/presets/${page.slug}`,
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            item: `${SITE_URL}/presets`,
            name: 'Presets',
            position: 1,
          },
        ],
      },
    ],
  };
}
