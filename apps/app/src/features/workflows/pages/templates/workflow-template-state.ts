import type {
  DataSource,
  DataSourceStatus,
} from '@genfeedai/props/workflows/workflow-templates-page.props';
import type { WorkflowApiService } from '@/features/workflows/services/workflow-api';
import type { PageAction, PageState } from './workflow-template-types';

export const DATA_SOURCES = ['templates', 'systemCatalog', 'featured'] as const;
export const CATALOG_DATA_SOURCES = [
  'templates',
  'systemCatalog',
] as const satisfies readonly DataSource[];

export const initialState: PageState = {
  templates: [],
  systemCatalog: [],
  featured: [],
  sourceStatus: {
    featured: 'loading',
    systemCatalog: 'loading',
    templates: 'loading',
  },
  hasSettled: false,
  selectedCategory: 'all',
  selectedSource: 'all',
  searchQuery: '',
  actionError: null,
  isBootstrapping: false,
  installingCanonicalId: null,
  copyingFeaturedWorkflowId: null,
};

function settleSource(
  state: PageState,
  source: DataSource,
  status: Exclude<DataSourceStatus, 'loading'>,
  data: Partial<
    Pick<PageState, 'featured' | 'systemCatalog' | 'templates'>
  > = {},
): PageState {
  const sourceStatus = { ...state.sourceStatus, [source]: status };
  return {
    ...state,
    ...data,
    hasSettled:
      state.hasSettled ||
      CATALOG_DATA_SOURCES.every((key) => sourceStatus[key] !== 'loading'),
    sourceStatus,
  };
}

export function pageReducer(state: PageState, action: PageAction): PageState {
  switch (action.type) {
    case 'LOAD_START': {
      const sourceStatus = { ...state.sourceStatus };
      for (const source of action.sources) {
        sourceStatus[source] = 'loading';
      }
      return { ...state, sourceStatus };
    }
    case 'TEMPLATES_LOADED':
      return settleSource(state, 'templates', 'ready', {
        templates: action.templates,
      });
    case 'CATALOG_LOADED':
      return settleSource(state, 'systemCatalog', 'ready', {
        systemCatalog: action.systemCatalog,
      });
    case 'FEATURED_LOADED':
      return settleSource(state, 'featured', 'ready', {
        featured: action.featured,
      });
    case 'LOAD_FAILED':
      return settleSource(state, action.source, 'error');
    case 'SET_CATEGORY':
      return { ...state, selectedCategory: action.category };
    case 'SET_SOURCE':
      return { ...state, selectedSource: action.source };
    case 'SET_SEARCH':
      return { ...state, searchQuery: action.searchQuery };
    case 'CLEAR_FILTERS':
      return {
        ...state,
        searchQuery: '',
        selectedCategory: 'all',
        selectedSource: 'all',
      };
    case 'BOOTSTRAP_START':
      return { ...state, isBootstrapping: true, actionError: null };
    case 'BOOTSTRAP_CANCEL':
      return {
        ...state,
        actionError:
          state.actionError?.key === 'bootstrap' ? null : state.actionError,
        isBootstrapping: false,
      };
    case 'BOOTSTRAP_ERROR':
      return { ...state, isBootstrapping: false, actionError: action.error };
    case 'INSTALL_START':
      return {
        ...state,
        installingCanonicalId: action.canonicalId,
        actionError: null,
      };
    case 'INSTALL_SUCCESS':
      return {
        ...state,
        installingCanonicalId: null,
        systemCatalog: state.systemCatalog.map((entry) =>
          entry.canonicalId === action.canonicalId
            ? {
                ...entry,
                installed: true,
                installedWorkflowId: action.installedWorkflowId,
              }
            : entry,
        ),
      };
    case 'INSTALL_ERROR':
      return {
        ...state,
        installingCanonicalId: null,
        actionError: action.error,
      };
    case 'COPY_FEATURED_START':
      return {
        ...state,
        copyingFeaturedWorkflowId: action.workflowId,
        actionError: null,
      };
    case 'COPY_FEATURED_ERROR':
      return {
        ...state,
        copyingFeaturedWorkflowId: null,
        actionError: action.error,
      };
    default:
      return state;
  }
}

/** Fetches one catalog request and describes its result as a reducer action. */
export async function fetchDataSource(
  service: WorkflowApiService,
  source: DataSource,
): Promise<PageAction> {
  if (source === 'templates') {
    return {
      templates: await service.listTemplates(),
      type: 'TEMPLATES_LOADED',
    };
  }
  if (source === 'featured') {
    return {
      featured: await service.listFeatured(),
      type: 'FEATURED_LOADED',
    };
  }
  const catalog = await service.listSystemCatalog();
  return {
    systemCatalog: catalog.filter((entry) => entry.installable),
    type: 'CATALOG_LOADED',
  };
}
