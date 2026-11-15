import { ModelCategory } from '@genfeedai/contracts';

/** Public Higgsfield docs host. The `.md` form of each page is the stable text. */
export const HIGGSFIELD_DOCS_MODELS_BASE =
  'https://docs.higgsfield.ai/docs/models';

export const HIGGSFIELD_CATALOG_URL = `${HIGGSFIELD_DOCS_MODELS_BASE}.md`;
export const HIGGSFIELD_VIDEO_CATALOG_URL = `${HIGGSFIELD_DOCS_MODELS_BASE}/video-generation.md`;
export const HIGGSFIELD_IMAGE_CATALOG_URL = `${HIGGSFIELD_DOCS_MODELS_BASE}/image-generation.md`;

const CATALOG_INDEX_SLUGS: ReadonlySet<string> = new Set([
  'video-generation',
  'image-generation',
]);

const FAMILY_LINK_PATTERN =
  /\(https:\/\/docs\.higgsfield\.ai\/docs\/models\/([a-z0-9.-]+)\.md\)/g;
const WORKFLOW_LINK_PATTERN =
  /\(https:\/\/docs\.higgsfield\.ai\/docs\/models\/([a-z0-9.-]+)\/([a-z0-9.-]+)\.md\)/g;
const TITLE_PATTERN = /^# (.+)$/m;
const ENDPOINT_ID_PATTERN = /\*\*Endpoint ID:\*\*\s*`([^`]+)`/;
const TITLE_SUFFIX_PATTERN = /\s+API$/;
const TITLE_SEPARATOR_PATTERN = /\s+—\s+/;
const EDIT_ENDPOINT_PATTERN = /\/(video-edit)$/;
const IMAGE_EDIT_ENDPOINT_PATTERN = /\/edit$/;

/** One callable endpoint the Higgsfield docs catalog lists. */
export interface HiggsfieldCatalogEntry {
  category: ModelCategory;
  /** Endpoint ID as the docs print it, for example `higgsfield/genjutsu/restyle/v1.0`. */
  endpoint: string;
  /** Display label cleaned from the page title. */
  label: string;
  /** The docs page the endpoint was read from. */
  sourceUrl: string;
}

/** Family page URLs (one per model family) linked from a catalog index page. */
export function extractFamilyUrls(indexMarkdown: string): string[] {
  const urls = new Set<string>();
  for (const match of indexMarkdown.matchAll(FAMILY_LINK_PATTERN)) {
    const slug = match[1];
    if (slug && !CATALOG_INDEX_SLUGS.has(slug)) {
      urls.add(`${HIGGSFIELD_DOCS_MODELS_BASE}/${slug}.md`);
    }
  }
  return [...urls];
}

/** Workflow page URLs linked from one family page. */
export function extractWorkflowUrls(familyMarkdown: string): string[] {
  const urls = new Set<string>();
  for (const match of familyMarkdown.matchAll(WORKFLOW_LINK_PATTERN)) {
    urls.add(`${HIGGSFIELD_DOCS_MODELS_BASE}/${match[1]}/${match[2]}.md`);
  }
  return [...urls];
}

function categoryFor(
  endpoint: string,
  catalogCategory: ModelCategory.IMAGE | ModelCategory.VIDEO,
): ModelCategory {
  if (
    catalogCategory === ModelCategory.VIDEO &&
    EDIT_ENDPOINT_PATTERN.test(endpoint)
  ) {
    return ModelCategory.VIDEO_EDIT;
  }
  if (
    catalogCategory === ModelCategory.IMAGE &&
    IMAGE_EDIT_ENDPOINT_PATTERN.test(endpoint)
  ) {
    return ModelCategory.IMAGE_EDIT;
  }
  return catalogCategory;
}

/**
 * Read one workflow page. Returns null for a page with no `Endpoint ID` line:
 * Soul ID is a training workflow with a catalog id only, so it is not a
 * generation endpoint and must not become a registry row.
 */
export function parseWorkflowPage(
  markdown: string,
  sourceUrl: string,
  catalogCategory: ModelCategory.IMAGE | ModelCategory.VIDEO,
): HiggsfieldCatalogEntry | null {
  const endpoint = ENDPOINT_ID_PATTERN.exec(markdown)?.[1]?.trim();
  if (!endpoint) return null;

  const rawTitle = TITLE_PATTERN.exec(markdown)?.[1]?.trim() ?? endpoint;
  const label = rawTitle
    .replace(TITLE_SUFFIX_PATTERN, '')
    .replace(TITLE_SEPARATOR_PATTERN, ' ')
    .trim();

  return {
    category: categoryFor(endpoint, catalogCategory),
    endpoint,
    label,
    sourceUrl,
  };
}
