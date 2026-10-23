import { formatEnumLabel, MediaType } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { parseWorkflowTemplateExampleOutput } from '@genfeedai/contracts/interfaces';
import type {
  CatalogSource,
  Translate,
  TypeTile,
  WorkflowTemplateCatalogFilter,
  WorkflowTemplateCatalogInput,
} from '@genfeedai/props/workflows/workflow-templates-page.props';
import type {
  FeaturedWorkflow,
  SystemWorkflowCatalogEntry,
  WorkflowTemplate,
} from '@/features/workflows/services/workflow-api';
import { workflowTemplatesTabPath } from '../workflow-library-tabs';
import type { CatalogItem } from './workflow-template-types';

/**
 * Category ids with a catalog label, mapped to their `categories.*` key.
 * Covers every `category` the API's workflow templates and system catalog
 * ship (`apps/server/api/src/collections/workflows/templates/`), plus the
 * page's own `all` and `system` fallbacks.
 */
const CATEGORY_MESSAGE_KEYS: Readonly<Record<string, string>> = {
  'ad-automation': 'adAutomation',
  ads: 'ads',
  agents: 'agents',
  all: 'all',
  analytics: 'analytics',
  automation: 'automation',
  batch: 'batch',
  campaigns: 'campaigns',
  content: 'content',
  editing: 'editing',
  entertainment: 'entertainment',
  generation: 'generation',
  integration: 'integration',
  launch: 'launch',
  library: 'library',
  product: 'product',
  'real-estate': 'realEstate',
  routines: 'routines',
  social: 'social',
  system: 'system',
  trends: 'trends',
  video: 'video',
};

/**
 * Schedule presets (`WORKFLOW_SCHEDULE_PRESETS`) mapped to their
 * `cadences.*` key. Any other cron reads as the generic "Scheduled".
 */
const CADENCE_MESSAGE_KEYS: Readonly<Record<string, string>> = {
  '0 9 * * 1-5': 'weekdaysMorning',
  '0 9 * * *': 'dailyMorning',
  '0 12 * * *': 'dailyNoon',
  '0 18 * * *': 'dailyEvening',
  '0 9 * * 1': 'mondaysMorning',
  '0 9,18 * * *': 'twiceDaily',
  '0 9 1 * *': 'monthlyFirst',
};

export const CATALOG_SOURCES = ['all', 'installed', 'available'] as const;

/**
 * Localized label for a category id. Known ids resolve through the
 * `categories.*` messages; ids the catalog does not know are title-cased.
 */
export function categoryLabel(category: string, translate: Translate): string {
  const messageKey = CATEGORY_MESSAGE_KEYS[category];
  if (messageKey) {
    return translate(`categories.${messageKey}`);
  }
  return formatEnumLabel(category) ?? category;
}

/** Localized cadence for a preset cron; any other schedule is "Scheduled". */
export function cadenceLabel(
  cron: string | undefined,
  translate: Translate,
): string | null {
  const trimmed = cron?.trim();
  if (!trimmed) {
    return null;
  }
  const messageKey = CADENCE_MESSAGE_KEYS[trimmed];
  return messageKey
    ? translate(`cadences.${messageKey}`)
    : translate('scheduled');
}

export function isCatalogSource(value: string): value is CatalogSource {
  return CATALOG_SOURCES.some((source) => source === value);
}

/** A positive integer rank. Anything else is not a showcase position. */
function readFeaturedRank(rank: number | undefined): number | null {
  if (typeof rank !== 'number' || !Number.isInteger(rank) || rank < 1) {
    return null;
  }
  return rank;
}

function toTemplateCatalogItem(
  template: WorkflowTemplate,
  href: (path: string) => string,
): CatalogItem {
  const featuredRank = readFeaturedRank(template.featuredRank);
  return {
    category: template.category || 'generation',
    changeSummary: template.changeSummary,
    description: template.description,
    edges: template.edges,
    exampleOutput: template.exampleOutput,
    ...(featuredRank === null ? {} : { featuredRank }),
    href: href(workflowTemplatesTabPath({ template: template.id })),
    id: `template-${template.id}`,
    nodes: template.nodes,
    schedule: template.schedule,
    source: 'available',
    title: template.name,
  };
}

export function buildCatalogItems({
  systemCatalog,
  templates,
  href,
}: WorkflowTemplateCatalogInput<
  SystemWorkflowCatalogEntry,
  WorkflowTemplate
>): CatalogItem[] {
  const systemIds = new Set(systemCatalog.map((entry) => entry.canonicalId));
  const catalogItems: CatalogItem[] = systemCatalog.map((entry) => ({
    category: entry.category || entry.family || 'system',
    changeSummary: entry.changeSummary,
    description: entry.description,
    edges: entry.edges,
    exampleOutput: entry.exampleOutput,
    href:
      entry.installed && entry.installedWorkflowId
        ? href(
            `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${entry.installedWorkflowId}`,
          )
        : undefined,
    id: `system-${entry.canonicalId}`,
    nodes: entry.nodes,
    schedule: entry.schedule,
    source: entry.installed ? 'installed' : 'available',
    systemEntry: entry,
    title: entry.label,
  }));

  // A system workflow that is also in the public template list is shown once,
  // as the installable system row, so All does not list it twice.
  const templateItems: CatalogItem[] = templates
    .filter((template) => !systemIds.has(template.id))
    .map((template) => toTemplateCatalogItem(template, href));

  return [...templateItems, ...catalogItems].sort((left, right) => {
    const leftRank = left.featuredRank ?? Number.POSITIVE_INFINITY;
    const rightRank = right.featuredRank ?? Number.POSITIVE_INFINITY;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    const leftGroup = left.systemEntry ? 1 : 0;
    const rightGroup = right.systemEntry ? 1 : 0;
    return leftGroup - rightGroup;
  });
}

/**
 * Featured is the admin-pinned workflows (#5511), already in pin order. A
 * pinned workflow's thumbnail is its example output (#5498); without a valid
 * one the card previews the graph.
 */
export function buildFeaturedItems(
  featured: FeaturedWorkflow[],
  untitledLabel: string,
): CatalogItem[] {
  return featured.map((workflow) => ({
    description: workflow.description ?? '',
    edges: workflow.edges,
    featuredWorkflowId: workflow.id,
    id: `featured-${workflow.id}`,
    nodes: workflow.nodes,
    exampleOutput: parseWorkflowTemplateExampleOutput(
      workflow.thumbnail
        ? { mediaType: MediaType.IMAGE, url: workflow.thumbnail }
        : undefined,
    ),
    source: 'available',
    title: workflow.label ?? untitledLabel,
  }));
}

/**
 * Featured fallback when nothing is pinned (#5510): the code showcase, in
 * `featuredRank` order. "Use" opens the template, the same path as All.
 */
export function buildShowcaseFeaturedItems(
  templates: WorkflowTemplate[],
  href: (path: string) => string,
): CatalogItem[] {
  return templates
    .flatMap((template) => {
      const featuredRank = readFeaturedRank(template.featuredRank);
      if (featuredRank === null) {
        return [];
      }
      return [
        {
          ...toTemplateCatalogItem(template, href),
          featuredRank,
          id: `showcase-${template.id}`,
        },
      ];
    })
    .sort(
      (left, right) => (left.featuredRank ?? 0) - (right.featuredRank ?? 0),
    );
}

export function buildTypeTiles(
  items: CatalogItem[],
  translate: Translate,
): TypeTile[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.category) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([id, count]) => ({
      count,
      id,
      label: categoryLabel(id, translate),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function filterCatalogItems(
  items: CatalogItem[],
  { category, searchQuery, source }: WorkflowTemplateCatalogFilter,
): CatalogItem[] {
  const query = searchQuery.trim().toLowerCase();
  return items.filter((item) => {
    if (source !== 'all' && item.source !== source) {
      return false;
    }
    if (category !== 'all' && item.category !== category) {
      return false;
    }
    if (!query) {
      return true;
    }
    return (
      item.title.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query)
    );
  });
}
