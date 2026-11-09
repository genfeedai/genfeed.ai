'use client';

import type {
  IBrandSubscriberStats,
  INewsletterAnalytics,
  INewsletterSettings,
  INewsletterUsage,
  IPaginatedResponse,
} from '@genfeedai/contracts/interfaces';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import {
  type BrandSubscriberRecord,
  NewsletterModuleService,
} from '@services/content/newsletter-module.service';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import type {
  NewsletterAnalyticsRange,
  NewsletterSubscribersFilter,
} from '@/features/newsletter/props/newsletter.props';

export const NEWSLETTER_QUERY_KEY = 'newsletter-module';

/** Cache key of one newsletter issue, shared by the editor and the send card. */
export function newsletterIssueQueryKey(newsletterId: string) {
  return ['newsletter', newsletterId] as const;
}
export const NEWSLETTER_SUBSCRIBERS_PAGE_SIZE = 50;

const EMPTY_SUBSCRIBERS: IPaginatedResponse<BrandSubscriberRecord> = {
  hasNext: false,
  hasPrevious: false,
  items: [],
  page: 1,
  pageSize: NEWSLETTER_SUBSCRIBERS_PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

/** Resolves the newsletter service with a fresh token, or null when signed out. */
export function useNewsletterService() {
  const { getToken } = useAuthIdentity();
  return useCallback(async () => {
    const token = await resolveAuthToken(getToken);
    return token ? NewsletterModuleService.getInstance(token) : null;
  }, [getToken]);
}

export function useNewsletterSubscribers(
  brandId: string | undefined,
  filter: NewsletterSubscribersFilter,
) {
  const getService = useNewsletterService();
  return useQuery({
    enabled: Boolean(brandId),
    queryFn: async ({ signal }) => {
      const service = await getService();
      if (!service || !brandId) return EMPTY_SUBSCRIBERS;
      return service.listSubscribers(
        brandId,
        {
          limit: NEWSLETTER_SUBSCRIBERS_PAGE_SIZE,
          page: filter.page,
          ...(filter.search ? { search: filter.search } : {}),
          ...(filter.status ? { status: filter.status } : {}),
        },
        signal,
      );
    },
    queryKey: [
      NEWSLETTER_QUERY_KEY,
      'subscribers',
      brandId ?? null,
      filter.page,
      filter.search,
      filter.status,
    ],
  });
}

export function useNewsletterSubscriberStats(brandId: string | undefined) {
  const getService = useNewsletterService();
  return useQuery<IBrandSubscriberStats | null>({
    enabled: Boolean(brandId),
    queryFn: async ({ signal }) => {
      const service = await getService();
      return service && brandId
        ? service.getSubscriberStats(brandId, signal)
        : null;
    },
    queryKey: [NEWSLETTER_QUERY_KEY, 'stats', brandId ?? null],
  });
}

export function useNewsletterUsage(brandId: string | undefined) {
  const getService = useNewsletterService();
  return useQuery<INewsletterUsage | null>({
    enabled: Boolean(brandId),
    queryFn: async ({ signal }) => {
      const service = await getService();
      return service && brandId ? service.getUsage(brandId, signal) : null;
    },
    queryKey: [NEWSLETTER_QUERY_KEY, 'usage', brandId ?? null],
  });
}

export function useNewsletterSettings(brandId: string | undefined) {
  const getService = useNewsletterService();
  return useQuery<INewsletterSettings | null>({
    enabled: Boolean(brandId),
    queryFn: async ({ signal }) => {
      const service = await getService();
      return service && brandId ? service.getSettings(brandId, signal) : null;
    },
    queryKey: [NEWSLETTER_QUERY_KEY, 'settings', brandId ?? null],
  });
}

export function useNewsletterAnalytics(
  brandId: string | undefined,
  range: NewsletterAnalyticsRange,
) {
  const getService = useNewsletterService();
  const { from, refreshKey, to } = range;
  return useQuery<INewsletterAnalytics | null>({
    enabled: Boolean(brandId),
    queryFn: async ({ signal }) => {
      const service = await getService();
      return service && brandId
        ? service.getAnalytics(brandId, { from, to }, signal)
        : null;
    },
    queryKey: [
      NEWSLETTER_QUERY_KEY,
      'analytics',
      brandId ?? null,
      from,
      to,
      refreshKey,
    ],
  });
}
