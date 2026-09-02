import { SocialConversationType } from '@genfeedai/contracts';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ALL_BRANDS_FILTER } from './messages-page.helpers';
import { useMessagesInboxFilters } from './use-messages-inbox-filters';

describe('useMessagesInboxFilters', () => {
  it('seeds brand filter from the route brand and builds the list query', () => {
    const { result } = renderHook(() =>
      useMessagesInboxFilters({
        brandSlug: 'demo',
        routeBrandId: 'brand-1',
      }),
    );

    expect(result.current.brandFilter).toBe('brand-1');
    expect(result.current.inboxView).toBe('inbox');
    expect(result.current.conversationType).toBe('all');
    expect(result.current.query).toEqual({
      brandId: 'brand-1',
      limit: 50,
      page: 1,
      status: 'open',
    });
  });

  it('switches cohesive inbox view filters in one update', () => {
    const { result } = renderHook(() =>
      useMessagesInboxFilters({
        brandSlug: undefined,
        routeBrandId: undefined,
      }),
    );

    act(() => {
      result.current.setInboxView('review');
    });

    expect(result.current.inboxView).toBe('review');
    expect(result.current.query).toEqual({
      allBrands: true,
      limit: 50,
      needsReview: true,
      page: 1,
    });
  });

  it('switches inbox surface without discarding the status view', () => {
    const { result } = renderHook(() =>
      useMessagesInboxFilters({
        brandSlug: 'demo',
        routeBrandId: 'brand-1',
      }),
    );

    act(() => {
      result.current.setInboxView('review');
      result.current.stepConversationPage(2);
    });

    expect(result.current.conversationPage).toBe(3);

    act(() => {
      result.current.setConversationType(SocialConversationType.DM);
    });

    expect(result.current.conversationType).toBe(SocialConversationType.DM);
    expect(result.current.inboxView).toBe('review');
    // A surface switch lands on a different list, so paging starts over.
    expect(result.current.conversationPage).toBe(1);
    expect(result.current.query).toEqual({
      brandId: 'brand-1',
      conversationType: SocialConversationType.DM,
      limit: 50,
      needsReview: true,
      page: 1,
    });
  });

  it('resets page and brand override when the route brand segment changes', () => {
    const { result, rerender } = renderHook(
      ({ brandSlug, routeBrandId }) =>
        useMessagesInboxFilters({ brandSlug, routeBrandId }),
      {
        initialProps: {
          brandSlug: 'demo' as string | undefined,
          routeBrandId: 'brand-1' as string | undefined,
        },
      },
    );

    act(() => {
      result.current.setBrandFilter(ALL_BRANDS_FILTER);
      result.current.stepConversationPage(1);
    });

    expect(result.current.brandFilter).toBe(ALL_BRANDS_FILTER);
    expect(result.current.conversationPage).toBe(2);

    rerender({ brandSlug: 'other', routeBrandId: 'brand-2' });

    expect(result.current.brandFilter).toBe('brand-2');
    // Route brand sync clears override only; page is independent.
    expect(result.current.conversationPage).toBe(2);
  });

  it('resets conversation page when search changes', () => {
    const { result } = renderHook(() =>
      useMessagesInboxFilters({
        brandSlug: 'demo',
        routeBrandId: 'brand-1',
      }),
    );

    act(() => {
      result.current.stepConversationPage(2);
      result.current.setSearch('launch');
    });

    expect(result.current.conversationPage).toBe(1);
    expect(result.current.query).toMatchObject({
      brandId: 'brand-1',
      page: 1,
      search: 'launch',
    });
  });
});
