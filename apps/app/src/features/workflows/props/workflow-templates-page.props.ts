import type { WorkflowTemplateExampleOutput } from '@genfeedai/contracts/interfaces';
import type { WorkflowTemplateCardPreviewProps } from '@genfeedai/props/workflows/workflow-template-card-preview.props';

export type CatalogSource = 'all' | 'installed' | 'available';
export type DataSource = 'templates' | 'systemCatalog' | 'featured';
export type DataSourceStatus = 'loading' | 'ready' | 'error';

export type ActionErrorKey = 'bootstrap' | 'install' | 'copyFeatured';

/** Copy is resolved at render, so a stored error follows the active locale. */
export type ActionError = {
  detail?: string;
  key: ActionErrorKey;
};

export type Translate = (key: string) => string;

/**
 * One `?template=` creation attempt. A creation runs once per template, auth
 * scope and explicit "Try again"; data reloads never start another one.
 */
export type BootstrapAttempt = {
  request: number;
  /** The auth-scoped service getter; a new identity means a new scope. */
  scope: string;
  templateId: string;
};

export type WorkflowTemplateCatalogItem<TSystemEntry> = {
  /** Absent on Featured workflows, which are not catalog entries. */
  category?: string;
  changeSummary?: string;
  description: string;
  edges?: WorkflowTemplateCardPreviewProps['edges'];
  /**
   * Showcase order (#5510). Set on code templates that carry `featuredRank`.
   * Admin-pinned Featured rows keep their own order via the array.
   */
  featuredRank?: number;
  /** Set on an admin-pinned Featured workflow (#5511); "Use" copies it. */
  featuredWorkflowId?: string;
  exampleOutput?: WorkflowTemplateExampleOutput;
  href?: string;
  id: string;
  nodes?: WorkflowTemplateCardPreviewProps['nodes'];
  schedule?: string;
  source: Exclude<CatalogSource, 'all'>;
  systemEntry?: TSystemEntry;
  title: string;
};

export type TypeTile = {
  count: number;
  id: string;
  label: string;
};

export type WorkflowTemplatesPageState<TTemplate, TSystemEntry, TFeatured> = {
  templates: TTemplate[];
  systemCatalog: TSystemEntry[];
  featured: TFeatured[];
  sourceStatus: Record<DataSource, DataSourceStatus>;
  /** True once every request has settled at least once. */
  hasSettled: boolean;
  selectedCategory: string;
  selectedSource: CatalogSource;
  searchQuery: string;
  actionError: ActionError | null;
  isBootstrapping: boolean;
  installingCanonicalId: string | null;
  copyingFeaturedWorkflowId: string | null;
};

export type WorkflowTemplatesPageAction<TTemplate, TSystemEntry, TFeatured> =
  | { type: 'LOAD_START'; sources: readonly DataSource[] }
  | { type: 'TEMPLATES_LOADED'; templates: TTemplate[] }
  | { type: 'CATALOG_LOADED'; systemCatalog: TSystemEntry[] }
  | { type: 'FEATURED_LOADED'; featured: TFeatured[] }
  | { type: 'LOAD_FAILED'; source: DataSource }
  | { type: 'SET_CATEGORY'; category: string }
  | { type: 'SET_SOURCE'; source: CatalogSource }
  | { type: 'SET_SEARCH'; searchQuery: string }
  | { type: 'CLEAR_FILTERS' }
  | { type: 'BOOTSTRAP_START' }
  | { type: 'BOOTSTRAP_CANCEL' }
  | { type: 'BOOTSTRAP_ERROR'; error: ActionError }
  | { type: 'INSTALL_START'; canonicalId: string }
  | {
      type: 'INSTALL_SUCCESS';
      canonicalId: string;
      installedWorkflowId: string;
    }
  | { type: 'INSTALL_ERROR'; error: ActionError }
  | { type: 'COPY_FEATURED_START'; workflowId: string }
  | { type: 'COPY_FEATURED_ERROR'; error: ActionError };

export interface WorkflowTemplateCatalogInput<TSystemEntry, TTemplate> {
  href: (path: string) => string;
  systemCatalog: TSystemEntry[];
  templates: TTemplate[];
}

export interface WorkflowTemplateCatalogFilter {
  category: string;
  searchQuery: string;
  source: CatalogSource;
}

export interface WorkflowTemplateItemActionsOptions<TItem, TSystemEntry> {
  copyingFeaturedWorkflowId: string | null;
  installingCanonicalId: string | null;
  copyFeaturedWorkflow: (workflowId: string) => Promise<void>;
  installSystemEntry: (
    entry: TSystemEntry,
    isOpeningAfterInstall: boolean,
  ) => Promise<void>;
  setDetailsItem: (item: TItem | null) => void;
}
