'use client';

import type {
  SocialAutomationState,
  SocialConversationStatus,
  SocialInboxQuery,
  SocialPlatform,
} from '@genfeedai/contracts/interfaces';
import { useCallback, useMemo, useReducer } from 'react';
import type {
  MessagesInboxView,
  MessagesSurface,
} from './messages-conversation-sidebar';
import { ALL_BRANDS_FILTER } from './messages-page.helpers';

type MessagesInboxFiltersState = {
  assignedOwnerId: string;
  automationState: SocialAutomationState | 'all';
  brandFilterOverride: string | null;
  brandFilterRouteKey: string | undefined;
  conversationPage: number;
  conversationType: MessagesSurface;
  credentialId: string;
  needsReviewOnly: boolean;
  platform: SocialPlatform | 'all';
  search: string;
  status: SocialConversationStatus | 'all';
  unreadOnly: boolean;
};

type MessagesInboxFiltersAction =
  | { type: 'set-assigned-owner-id'; assignedOwnerId: string }
  | {
      type: 'set-automation-state';
      automationState: SocialAutomationState | 'all';
    }
  | { type: 'set-brand-filter'; brandFilter: string }
  | { type: 'set-conversation-page'; page: number }
  | { type: 'set-conversation-type'; conversationType: MessagesSurface }
  | { type: 'set-credential-id'; credentialId: string }
  | { type: 'set-inbox-view'; view: MessagesInboxView }
  | { type: 'set-platform'; platform: SocialPlatform | 'all' }
  | { type: 'set-search'; search: string }
  | { type: 'step-conversation-page'; delta: number }
  | { type: 'sync-route-brand'; brandSlug: string | undefined };

function createInitialFiltersState(
  brandSlug: string | undefined,
): MessagesInboxFiltersState {
  return {
    assignedOwnerId: '',
    automationState: 'all',
    brandFilterOverride: null,
    brandFilterRouteKey: brandSlug,
    conversationPage: 1,
    conversationType: 'all',
    credentialId: '',
    needsReviewOnly: false,
    platform: 'all',
    search: '',
    status: 'open',
    unreadOnly: false,
  };
}

function resolveInboxViewStatus(view: MessagesInboxView): {
  needsReviewOnly: boolean;
  status: SocialConversationStatus | 'all';
  unreadOnly: boolean;
} {
  switch (view) {
    case 'all':
      return { needsReviewOnly: false, status: 'all', unreadOnly: false };
    case 'unread':
      return { needsReviewOnly: false, status: 'all', unreadOnly: true };
    case 'review':
      return { needsReviewOnly: true, status: 'all', unreadOnly: false };
    case 'archived':
      return {
        needsReviewOnly: false,
        status: 'archived',
        unreadOnly: false,
      };
    case 'resolved':
      return {
        needsReviewOnly: false,
        status: 'resolved',
        unreadOnly: false,
      };
    default:
      return { needsReviewOnly: false, status: 'open', unreadOnly: false };
  }
}

function messagesInboxFiltersReducer(
  state: MessagesInboxFiltersState,
  action: MessagesInboxFiltersAction,
): MessagesInboxFiltersState {
  switch (action.type) {
    case 'set-platform':
      return {
        ...state,
        conversationPage: 1,
        platform: action.platform,
      };
    case 'set-brand-filter':
      return {
        ...state,
        brandFilterOverride: action.brandFilter,
        conversationPage: 1,
      };
    case 'sync-route-brand':
      if (state.brandFilterRouteKey === action.brandSlug) {
        return state;
      }
      return {
        ...state,
        brandFilterOverride: null,
        brandFilterRouteKey: action.brandSlug,
      };
    case 'set-inbox-view': {
      const next = resolveInboxViewStatus(action.view);
      return {
        ...state,
        conversationPage: 1,
        needsReviewOnly: next.needsReviewOnly,
        status: next.status,
        unreadOnly: next.unreadOnly,
      };
    }
    case 'set-conversation-type':
      return {
        ...state,
        conversationPage: 1,
        conversationType: action.conversationType,
      };
    case 'set-automation-state':
      return {
        ...state,
        automationState: action.automationState,
        conversationPage: 1,
      };
    case 'set-credential-id':
      return {
        ...state,
        conversationPage: 1,
        credentialId: action.credentialId,
      };
    case 'set-assigned-owner-id':
      return {
        ...state,
        assignedOwnerId: action.assignedOwnerId,
        conversationPage: 1,
      };
    case 'set-search':
      return {
        ...state,
        conversationPage: 1,
        search: action.search,
      };
    case 'set-conversation-page':
      return {
        ...state,
        conversationPage: Math.max(1, action.page),
      };
    case 'step-conversation-page':
      return {
        ...state,
        conversationPage: Math.max(1, state.conversationPage + action.delta),
      };
    default:
      return state;
  }
}

function deriveInboxView(state: MessagesInboxFiltersState): MessagesInboxView {
  if (state.needsReviewOnly) {
    return 'review';
  }
  if (state.unreadOnly) {
    return 'unread';
  }

  switch (state.status) {
    case 'all':
      return 'all';
    case 'archived':
      return 'archived';
    case 'resolved':
      return 'resolved';
    default:
      return 'inbox';
  }
}

export interface UseMessagesInboxFiltersParams {
  readonly brandSlug: string | undefined;
  readonly routeBrandId: string | undefined;
}

export function useMessagesInboxFilters({
  brandSlug,
  routeBrandId,
}: UseMessagesInboxFiltersParams) {
  const [state, dispatch] = useReducer(
    messagesInboxFiltersReducer,
    brandSlug,
    createInitialFiltersState,
  );

  // Adjust override when the brand URL segment changes (brand ↔ org navigation).
  if (state.brandFilterRouteKey !== brandSlug) {
    dispatch({ brandSlug, type: 'sync-route-brand' });
  }

  const brandFilter =
    state.brandFilterOverride ?? routeBrandId ?? ALL_BRANDS_FILTER;
  const inboxView = useMemo(() => deriveInboxView(state), [state]);

  const query = useMemo((): SocialInboxQuery => {
    const isOrgWideBrandFilter = brandFilter === ALL_BRANDS_FILTER;

    return {
      limit: 50,
      page: state.conversationPage,
      ...(state.conversationType !== 'all'
        ? { conversationType: state.conversationType }
        : {}),
      // Org-scoped Messages must not inherit a stale session brand.
      ...(isOrgWideBrandFilter
        ? { allBrands: true }
        : { brandId: brandFilter }),
      ...(state.platform !== 'all' ? { platform: state.platform } : {}),
      ...(state.status !== 'all' ? { status: state.status } : {}),
      ...(state.automationState !== 'all'
        ? { automationState: state.automationState }
        : {}),
      ...(state.unreadOnly ? { unread: true } : {}),
      ...(state.needsReviewOnly ? { needsReview: true } : {}),
      ...(state.credentialId.trim()
        ? { credentialId: state.credentialId.trim() }
        : {}),
      ...(state.assignedOwnerId.trim()
        ? { assignedOwnerId: state.assignedOwnerId.trim() }
        : {}),
      ...(state.search.trim() ? { search: state.search.trim() } : {}),
    };
  }, [brandFilter, state]);

  const setPlatform = useCallback((platform: SocialPlatform | 'all') => {
    dispatch({ platform, type: 'set-platform' });
  }, []);

  const setBrandFilter = useCallback((nextBrandFilter: string) => {
    dispatch({ brandFilter: nextBrandFilter, type: 'set-brand-filter' });
  }, []);

  const setInboxView = useCallback((view: MessagesInboxView) => {
    dispatch({ type: 'set-inbox-view', view });
  }, []);

  const setConversationType = useCallback(
    (conversationType: MessagesSurface) => {
      dispatch({ conversationType, type: 'set-conversation-type' });
    },
    [],
  );

  const setAutomationState = useCallback(
    (automationState: SocialAutomationState | 'all') => {
      dispatch({ automationState, type: 'set-automation-state' });
    },
    [],
  );

  const setCredentialId = useCallback((credentialId: string) => {
    dispatch({ credentialId, type: 'set-credential-id' });
  }, []);

  const setAssignedOwnerId = useCallback((assignedOwnerId: string) => {
    dispatch({ assignedOwnerId, type: 'set-assigned-owner-id' });
  }, []);

  const setSearch = useCallback((search: string) => {
    dispatch({ search, type: 'set-search' });
  }, []);

  const setConversationPage = useCallback((page: number) => {
    dispatch({ page, type: 'set-conversation-page' });
  }, []);

  const stepConversationPage = useCallback((delta: number) => {
    dispatch({ delta, type: 'step-conversation-page' });
  }, []);

  return {
    assignedOwnerId: state.assignedOwnerId,
    automationState: state.automationState,
    brandFilter,
    conversationPage: state.conversationPage,
    conversationType: state.conversationType,
    credentialId: state.credentialId,
    inboxView,
    platform: state.platform,
    query,
    search: state.search,
    setAssignedOwnerId,
    setAutomationState,
    setBrandFilter,
    setConversationPage,
    setConversationType,
    setCredentialId,
    setInboxView,
    setPlatform,
    setSearch,
    stepConversationPage,
  };
}
