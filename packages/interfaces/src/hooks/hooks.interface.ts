import type { ReactNode } from 'react';
import type { ContentScope } from '../common/content-scope.interface';
import type {
  IActivity,
  IAnalytics,
  IBrand,
  ICreditsBreakdown,
  IOrganizationSetting,
  ISubscription,
} from '../index';

export interface UseSubscriptionReturn {
  subscription?: ISubscription | null;
  creditsBreakdown?: ICreditsBreakdown | null;
  error?: string | null;
  isLoading: boolean;
  isSubscriptionActive: boolean;
  openBillingPortal: () => Promise<void>;
  changeSubscriptionPlan: (newPriceId: string) => Promise<void>;
  refreshSubscription: () => Promise<void>;
  refreshCreditsBreakdown: () => Promise<void>;
}

export interface FindAllService<T> {
  findAll(query?: Record<string, unknown>): Promise<T[]>;
}

export interface BrandsOptions {
  organizationId?: string;
  initialFilter?: string;
  autoLoad?: boolean;
}

export interface BrandsReturn {
  brands: IBrand[];
  isLoading: boolean;
  isRefreshing: boolean;
  filter: string;
  setFilter: (filter: string) => void;
  filteredBrands: IBrand[];
  findBrands: (isRefreshing?: boolean, signal?: AbortSignal) => Promise<void>;
}

export interface MasonryActionStates extends Record<string, boolean> {
  isPublishing: boolean;
  isUpscaling: boolean;
  isDeleting: boolean;
  isCloning: boolean;
  isReversing: boolean;
  isMirroring: boolean;
  isPortraiting: boolean;
  isSquaring: boolean;
  isLandscaping: boolean;
  isConverting: boolean;
  isConvertingToVideo: boolean;
  isEnhancing: boolean;
  isGeneratingCaptions: boolean;
  isAddingTextOverlay: boolean;
  isMarkingValidated: boolean;
  isMarkingArchived: boolean;
  isMarkingRejected: boolean;
  isDownloading: boolean;
  isVoting: boolean;
  isSettingAsLogo: boolean;
  isSettingAsBanner: boolean;
}

export interface UseWebsocketPromptOptions<TResult = unknown> {
  onSuccess: (result: TResult) => void;
  onError?: (error: Error) => void;
  onTimeout?: () => void;
  timeoutMs?: number;
  timeoutMessage?: string;
  errorMessage?: string;
}

export interface UseSocketManagerOptions {
  namespace?: string;
  autoConnect?: boolean;
}

export interface AnalyticsScopedOptions {
  scope: ContentScope;
  scopeId?: string;
  autoLoad?: boolean;
}

export interface AnalyticsCacheEntry {
  data: Partial<IAnalytics>;
  cachedAt: string;
}

export interface AnalyticsScopedReturn {
  analytics: Partial<IAnalytics>;
  cachedAt: string | null;
  error: Error | null;
  isLoading: boolean;
  isUsingCache: boolean;
  isRefreshing: boolean;
  scope: ContentScope;
  scopeId?: string;
  selectedScope: ContentScope;
  selectedScopeId?: string;
  setSelectedScope: (scope: ContentScope) => void;
  setSelectedScopeId: (id?: string) => void;
  refresh: () => Promise<void>;
}

export interface UseIntersectionObserverOptions {
  threshold?: number | number[];
  root?: Element | null;
  rootMargin?: string;
  triggerOnce?: boolean;
}

export interface LazyLoadProps {
  children: ReactNode;
  placeholder?: ReactNode;
  rootMargin?: string;
  threshold?: number;
  className?: string;
  onVisible?: () => void;
}

export interface ActivitiesOptions {
  initialFilter?: string;
  autoLoad?: boolean;
  scope?: ContentScope;
  page?: number;
  limit?: number;
}

export interface ActivitiesReturn {
  activities: IActivity[];
  isLoading: boolean;
  isRefreshing: boolean;
  filter: string;
  filteredActivities: IActivity[];
  setFilter: (filter: string) => void;
  refresh: () => Promise<void>;
  clearCompletedActivities: (activityIds: string[]) => Promise<void>;
  markActivitiesAsRead: (activityIds?: string[]) => Promise<void>;
  toggleActivityRead: (activityId: string) => Promise<void>;
  activityStats: {
    total: number;
    todayCount: number;
    statusCounts: Record<string, number>;
  };
}

export interface UseOrganizationReturn {
  settings: IOrganizationSetting | null;
  isLoading: boolean;
  error: string | null;
  updateSettings: (
    key: keyof IOrganizationSetting,
    value: boolean | number | string,
  ) => Promise<void>;
  refresh: () => Promise<void>;
}
