'use client';

import { useAgentDock } from '@contexts/ui/agent-dock-context';
import { useAgentChatStore } from '@genfeedai/agent';
import { AgentOAuthConnectMenu } from '@genfeedai/agent/components/AgentOAuthConnectMenu';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { getBrandEntityId } from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import {
  ButtonSize,
  ButtonVariant,
  Platform,
  SocialConversationType,
} from '@genfeedai/contracts';
import {
  APP_ROUTES,
  MESSAGES_CONVERSATION_QUERY_PARAM,
  MESSAGES_TYPE_QUERY_PARAM,
  resolveOrganizationModulePresentationAccess,
} from '@genfeedai/contracts/constants';
import type { SocialConversationStatus } from '@genfeedai/contracts/interfaces';
import { useFeatureFlagContext } from '@genfeedai/hooks/feature-flags/provider';
import type { SocialMessageModel } from '@genfeedai/models/social/social-message.model';
import type { MessagesSurface } from '@genfeedai/props/messages/messages-conversation-sidebar.props';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { usePlatformOAuthConnect } from '@hooks/auth/use-platform-oauth-connect/use-platform-oauth-connect';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { SocialMessagesService } from '@services/social/messages.service';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Button } from '@ui/primitives/button';
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  LinkIcon,
  LockKeyhole,
  MessageSquare,
  Sparkles,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';

import { useRefreshInboxIndicators } from '@/components/shell/use-messages-unread-count';
import { useWorkspaceNavPanel } from '@/components/workspace-shell/WorkspaceNavPanelContext';
import MessagesAdvancedFilters from './messages-advanced-filters';
import {
  getParticipantLabel,
  MessagesConversationSidebar,
} from './messages-conversation-sidebar';
import {
  ALL_BRANDS_FILTER,
  formatMessageTime,
  getMessageProvenanceItems,
  parseMessagesSurface,
  STATUS_LABELS,
  STATUS_STYLES,
} from './messages-page.helpers';
import MessagesReplyComposer from './messages-reply-composer';
import { useMessagesSurfaceAdapter } from './messages-surface-adapter';
import { useMessagesActions } from './use-messages-actions';
import { useMessagesConversations } from './use-messages-conversations';
import { useMessagesInboxFilters } from './use-messages-inbox-filters';

const MESSAGE_CREDENTIAL_PLATFORMS = new Set([
  Platform.INSTAGRAM,
  Platform.LINKEDIN,
  Platform.TIKTOK,
  Platform.TWITTER,
  Platform.UNIPILE,
  Platform.YOUTUBE,
]);
const SYNCABLE_MESSAGE_CREDENTIAL_PLATFORMS = new Set([
  Platform.INSTAGRAM,
  Platform.LINKEDIN,
  Platform.TWITTER,
  Platform.YOUTUBE,
]);

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wider',
        STATUS_STYLES[status] ?? 'bg-background-tertiary text-muted-foreground',
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function PlatformPill({ platform }: { platform: string }) {
  return (
    <span className="inline-flex items-center rounded bg-background-tertiary px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
      {platform}
    </span>
  );
}

function MessageBubble({
  busyAction,
  canAttachReference,
  canWrite,
  isReferenced,
  message,
  onApproveDraft,
  onRejectDraft,
  onToggleReference,
}: {
  busyAction: string | null;
  canAttachReference?: boolean;
  canWrite: boolean;
  isReferenced?: boolean;
  message: SocialMessageModel;
  onApproveDraft: (messageId: string) => void;
  onRejectDraft: (messageId: string) => void;
  /** Only offered where an agent conversation can consume the reference. */
  onToggleReference?: (message: SocialMessageModel) => void;
}) {
  const translate = useTranslations('common.messages');
  const isOutbound = message.direction === 'outbound';
  const isDraft = isOutbound && message.status === 'draft';
  const provenanceItems = getMessageProvenanceItems(message);

  return (
    <div className={cn('flex', isOutbound ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[78%] rounded border px-3 py-2',
          isOutbound
            ? 'border-primary/20 bg-primary/10 text-primary-foreground'
            : 'border-border bg-background-tertiary text-foreground',
        )}
      >
        <div className="mb-1 flex items-center gap-2 text-2xs uppercase tracking-wider text-gray-800">
          <span>{isOutbound ? 'Manager' : message.senderName || 'Sender'}</span>
          <span>{formatMessageTime(message.createdAt)}</span>
          <span>{message.status}</span>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {message.body}
        </p>
        {provenanceItems.length > 0 ? (
          <dl
            aria-label="Message provenance"
            className="mt-3 grid gap-1 border-t border-border pt-2 text-2xs text-muted-foreground"
          >
            {provenanceItems.map((item) => (
              <div className="flex min-w-0 gap-2" key={item.label}>
                <dt className="shrink-0 font-medium text-gray-800">
                  {item.label}
                </dt>
                <dd className="min-w-0 truncate text-muted-foreground">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {isDraft ? (
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              isDisabled={!canWrite || Boolean(busyAction)}
              isLoading={busyAction === `approve:${message.id}`}
              onClick={() => onApproveDraft(message.id)}
            >
              {translate('actions.approve')}
            </Button>
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              isDisabled={!canWrite || Boolean(busyAction)}
              isLoading={busyAction === `reject:${message.id}`}
              onClick={() => onRejectDraft(message.id)}
            >
              {translate('actions.reject')}
            </Button>
          </div>
        ) : null}
        {onToggleReference ? (
          <div className="mt-2 flex justify-end border-t border-border pt-2">
            <Button
              ariaLabel={
                isReferenced
                  ? translate('agent.removeMessage')
                  : translate('agent.attachMessage')
              }
              icon={<LinkIcon className="size-3.5" />}
              isDisabled={!canAttachReference}
              onClick={() => onToggleReference(message)}
              size={ButtonSize.SM}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            >
              {isReferenced
                ? translate('agent.attached')
                : translate('agent.askMessage')}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function MessagesPage() {
  const translate = useTranslations('common.messages');
  const { brandSlug, href, orgHref } = useOrgUrl();
  const translateModules = useTranslations(
    'common.settings.organizationModules',
  );
  const {
    brandId,
    brands,
    credentialsLoading,
    isBrandScopeResolved,
    organizationId: scopedOrganizationId,
    settings,
    settingsLoading,
  } = useBrand();
  const { flags: platformFlags } = useFeatureFlagContext();
  const moduleAccess = resolveOrganizationModulePresentationAccess(
    settingsLoading ? null : settings,
    'messages',
    platformFlags,
  );
  const canWrite = Boolean(scopedOrganizationId && moduleAccess.isAllowed);
  const writeBlockedReason = canWrite
    ? undefined
    : settingsLoading
      ? translateModules('loading')
      : !moduleAccess.isAllowed && moduleAccess.reason === 'unreleased'
        ? translateModules('unreleasedTitle', {
            module: translateModules('modules.messages.label'),
          })
        : !moduleAccess.isAllowed && moduleAccess.reason === 'disabled'
          ? translateModules('disabledTitle', {
              module: translateModules('modules.messages.label'),
            })
          : !moduleAccess.isAllowed &&
              moduleAccess.reason === 'subscription-required'
            ? translateModules('subscriptionTitle', {
                module: translateModules('modules.messages.label'),
              })
            : translateModules('unavailable');
  const blockedHelp =
    !moduleAccess.isAllowed && moduleAccess.reason === 'disabled'
      ? translateModules('disabledHelp')
      : !moduleAccess.isAllowed &&
          moduleAccess.reason === 'subscription-required'
        ? translateModules('subscriptionHelp')
        : !moduleAccess.isAllowed && moduleAccess.reason === 'unreleased'
          ? translateModules('unreleasedHelp')
          : undefined;
  const blockedSettingsHref =
    !moduleAccess.isAllowed && moduleAccess.reason === 'subscription-required'
      ? orgHref(APP_ROUTES.SETTINGS.SUBSCRIPTION)
      : !moduleAccess.isAllowed && moduleAccess.reason === 'disabled'
        ? orgHref(APP_ROUTES.SETTINGS.MODULES)
        : undefined;
  const workspaceNavPanel = useWorkspaceNavPanel();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const { replace } = useRouter();
  const getMessagesService = useAuthedService((token: string) =>
    SocialMessagesService.getInstance(token),
  );
  const activeThreadId = useAgentChatStore((state) => state.activeThreadId);
  const activeThread = useAgentChatStore((state) =>
    state.threads.find((thread) => thread.id === state.activeThreadId),
  );

  const routeBrandId = useMemo(() => {
    if (!brandSlug) {
      return undefined;
    }

    const routeBrand = brands.find((brand) => brand.slug === brandSlug);
    return getBrandEntityId(routeBrand) || undefined;
  }, [brandSlug, brands]);

  const brandOptions = useMemo(
    () =>
      brands
        .map((brand) => ({
          id: getBrandEntityId(brand),
          label: brand.label || brand.slug || getBrandEntityId(brand),
        }))
        .filter((brand) => Boolean(brand.id)),
    [brands],
  );

  const filters = useMessagesInboxFilters({
    brandSlug,
    initialConversationType: parseMessagesSurface(
      searchParams.get(MESSAGES_TYPE_QUERY_PARAM),
    ),
    routeBrandId,
  });

  const inboxBrands = useMemo(
    () =>
      filters.brandFilter === ALL_BRANDS_FILTER
        ? brands
        : brands.filter(
            (brand) => getBrandEntityId(brand) === filters.brandFilter,
          ),
    [brands, filters.brandFilter],
  );
  const connectedAccounts = useMemo(
    () =>
      inboxBrands.flatMap((brand) =>
        (brand.credentials ?? []).filter(
          (credential) =>
            credential.isConnected === true &&
            !credential.isDeleted &&
            MESSAGE_CREDENTIAL_PLATFORMS.has(
              String(credential.platform).toLowerCase() as Platform,
            ),
        ),
      ),
    [inboxBrands],
  );
  const filteredAccounts = useMemo(
    () =>
      connectedAccounts.filter(
        (credential) =>
          filters.platform === 'all' ||
          String(credential.platform).toLowerCase() === filters.platform,
      ),
    [connectedAccounts, filters.platform],
  );
  const syncCredentials = useMemo(
    () =>
      filteredAccounts.filter(
        (credential) =>
          !filters.credentialId || credential.id === filters.credentialId,
      ),
    [filteredAccounts, filters.credentialId],
  );
  const hasConnectedAccounts = connectedAccounts.length > 0;
  const hasSyncableAccounts = syncCredentials.some((credential) => {
    const platform = String(credential.platform).toLowerCase() as Platform;
    return (
      SYNCABLE_MESSAGE_CREDENTIAL_PLATFORMS.has(platform) &&
      (filters.conversationType !== SocialConversationType.DM ||
        platform !== Platform.YOUTUBE)
    );
  });
  const isAccountsLoading =
    credentialsLoading || isBrandScopeResolved === false;
  const connectionBrandId =
    filters.brandFilter !== ALL_BRANDS_FILTER
      ? filters.brandFilter
      : (routeBrandId ??
        (brandOptions.length === 1 ? brandOptions[0]?.id : undefined));

  const updateSelectedConversationParam = useCallback(
    (conversationId: string | null, conversationType?: MessagesSurface) => {
      const nextSearchParams = new URLSearchParams(searchParamsString);

      if (conversationId) {
        nextSearchParams.set(MESSAGES_CONVERSATION_QUERY_PARAM, conversationId);
      } else {
        nextSearchParams.delete(MESSAGES_CONVERSATION_QUERY_PARAM);
      }

      // The type filter is shareable, so `?type=` follows the selection.
      if (conversationType === 'all') {
        nextSearchParams.delete(MESSAGES_TYPE_QUERY_PARAM);
      } else if (conversationType) {
        nextSearchParams.set(MESSAGES_TYPE_QUERY_PARAM, conversationType);
      }

      const queryString = nextSearchParams.toString();
      replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, replace, searchParamsString],
  );

  const clearSelectedConversationParam = useCallback(() => {
    updateSelectedConversationParam(null);
  }, [updateSelectedConversationParam]);

  const requestedConversationId =
    searchParams.get(MESSAGES_CONVERSATION_QUERY_PARAM) ?? null;

  const refreshInboxIndicators = useRefreshInboxIndicators();

  const {
    conversationPagination,
    conversations,
    isLoadingConversations,
    isLoadingMessages,
    loadConversations,
    loadError,
    messagePagination,
    messages,
    refreshSelectedThread,
    selectedConversation,
    selectedId,
    setLoadError,
    setMessagePage,
    setSelectedId,
  } = useMessagesConversations({
    getMessagesService,
    onClearSelectedConversationParam: clearSelectedConversationParam,
    onUnreadStateChange: refreshInboxIndicators,
    query: filters.query,
    requestedConversationId,
    scopedOrganizationId,
  });

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      setSelectedId(conversationId);
      updateSelectedConversationParam(conversationId);
    },
    [setSelectedId, updateSelectedConversationParam],
  );

  // Social references ride the dock conversation: an existing thread must be
  // bound to the conversation's brand; a new one binds to the selected brand.
  const agentDock = useAgentDock();
  const isAgentDockAvailable = agentDock?.isAvailable === true;
  const referenceBrandId = activeThreadId ? activeThread?.brandId : brandId;
  const canAttachReferences = Boolean(
    isAgentDockAvailable &&
      referenceBrandId &&
      selectedConversation?.brandId === referenceBrandId,
  );

  const {
    busyAction,
    draft,
    error: actionError,
    handleAction,
    handleApproveDraft,
    handleDraftChange,
    handleSuggestedReply,
    handleRejectDraft,
    handleStatusChange,
    handleSync,
    handleToggleConversationReference,
    handleToggleMessageReference,
    isConversationReferenced,
    isMessageReferenced,
    notice,
    references,
  } = useMessagesActions({
    canAttachReferences,
    canWrite,
    conversationType: filters.conversationType,
    getMessagesService,
    loadConversations,
    onInboxReadStateChange: refreshInboxIndicators,
    onLoadError: setLoadError,
    refreshSelectedThread,
    selectedConversation,
    selectedId,
    syncCredentials,
  });

  const error = actionError ?? loadError;

  const automationHref = useMemo(() => {
    if (!selectedConversation) {
      return href(APP_ROUTES.AUTOMATION.WORKFLOWS_NEW);
    }

    const params = new URLSearchParams({
      conversationId: selectedConversation.id,
      platform: String(selectedConversation.platform),
      source: 'messages',
      trigger: 'commentTrigger',
    });

    if (selectedConversation.sourceContentId) {
      params.set('sourceContentId', selectedConversation.sourceContentId);
    }
    if (selectedConversation.credentialId) {
      params.set('credentialId', selectedConversation.credentialId);
    }

    return href(`${APP_ROUTES.AUTOMATION.WORKFLOWS_NEW}?${params.toString()}`);
  }, [href, selectedConversation]);

  useMessagesSurfaceAdapter({ references });

  // Asking attaches the typed selector (never the message body) and opens the
  // dock; asking about something already attached only reopens the dock.
  const openAgentDock = agentDock?.open;
  const handleAskAgentAboutConversation = useCallback(() => {
    if (!isConversationReferenced) {
      handleToggleConversationReference();
    }
    openAgentDock?.();
  }, [
    handleToggleConversationReference,
    isConversationReferenced,
    openAgentDock,
  ]);
  const handleAskAgentAboutMessage = useCallback(
    (message: SocialMessageModel) => {
      const isAttaching = !isMessageReferenced(message);
      handleToggleMessageReference(message);
      if (isAttaching) {
        openAgentDock?.();
      }
    },
    [handleToggleMessageReference, isMessageReferenced, openAgentDock],
  );

  // A DM has no post or comment behind it, so the thread reads top-to-bottom
  // on its own instead of hanging off a source-content anchor.
  const isDmThread =
    selectedConversation?.conversationType === SocialConversationType.DM;
  const isTikTokReadOnly = selectedConversation?.platform === Platform.TIKTOK;
  const isReadOnly = !canWrite || isTikTokReadOnly;
  // While the reply bar is up it carries the action status and failures.
  const isComposerVisible = Boolean(selectedConversation) && !isReadOnly;

  const availability = !canWrite
    ? {
        canPostReply: false,
        canSendDm: false,
        postReplyReason: writeBlockedReason,
        sendDmReason: writeBlockedReason,
      }
    : isTikTokReadOnly
      ? {
          canPostReply: false,
          canSendDm: false,
          postReplyReason: 'TikTok conversations are read-only in Genfeed',
          sendDmReason: 'TikTok conversations are read-only in Genfeed',
        }
      : (selectedConversation?.availability ?? {
          canPostReply: false,
          canSendDm: false,
          postReplyReason: 'Select a conversation before replying.',
          sendDmReason: 'Select a conversation before sending a DM.',
        });
  const advancedFilters = (
    <MessagesAdvancedFilters
      accounts={filteredAccounts}
      assignedOwnerId={filters.assignedOwnerId}
      automationState={filters.automationState}
      credentialId={filters.credentialId}
      onAssignedOwnerIdChange={filters.setAssignedOwnerId}
      onAutomationStateChange={filters.setAutomationState}
      onCredentialIdChange={filters.setCredentialId}
    />
  );
  // In-place OAuth connect — return to this messages surface after verify.
  const handleOAuthConnect = usePlatformOAuthConnect({
    brandId: connectionBrandId ?? null,
  });
  const availableOAuthConnect = connectionBrandId
    ? handleOAuthConnect
    : undefined;

  const conversationNavPanel = (
    <MessagesConversationSidebar
      onOAuthConnect={availableOAuthConnect}
      advancedFilters={advancedFilters}
      brandFilter={filters.brandFilter}
      brandOptions={brandOptions}
      busyAction={busyAction}
      conversations={conversations}
      conversationType={filters.conversationType}
      hasConnectedAccounts={hasConnectedAccounts}
      hasSyncableAccounts={hasSyncableAccounts}
      isAccountsLoading={isAccountsLoading}
      isLoading={isLoadingConversations}
      onBrandFilterChange={(value) => {
        filters.setBrandFilter(value);
        setSelectedId(null);
        updateSelectedConversationParam(null);
      }}
      onConversationTypeChange={(value) => {
        filters.setConversationType(value);
        setSelectedId(null);
        updateSelectedConversationParam(null, value);
      }}
      onNextPage={() => filters.stepConversationPage(1)}
      onPlatformChange={(value) => {
        filters.setPlatform(value);
      }}
      onPreviousPage={() => filters.stepConversationPage(-1)}
      onSearchChange={(value) => {
        filters.setSearch(value);
      }}
      onSelect={handleSelectConversation}
      onSync={handleSync}
      onViewChange={filters.setInboxView}
      pagination={conversationPagination}
      platform={filters.platform}
      search={filters.search}
      selectedId={selectedId}
      view={filters.inboxView}
      writeBlockedReason={writeBlockedReason}
    />
  );
  const isConversationNavProjected = Boolean(
    workspaceNavPanel?.portalTargets.length,
  );
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <h1 className="sr-only">{translate('title')}</h1>
      {writeBlockedReason ? (
        <div
          role="status"
          data-testid="messages-module-notice"
          className="mx-4 mt-3 shrink-0 rounded border border-border bg-background-secondary px-3 py-2 text-sm"
        >
          <p>{writeBlockedReason}</p>
          {blockedHelp ? (
            <p className="mt-1 text-xs text-muted-foreground">{blockedHelp}</p>
          ) : null}
          {blockedSettingsHref ? (
            <Button asChild size={ButtonSize.SM} variant={ButtonVariant.LINK}>
              <Link href={blockedSettingsHref}>
                {translateModules(
                  !moduleAccess.isAllowed &&
                    moduleAccess.reason === 'subscription-required'
                    ? 'manageSubscription'
                    : 'manageModules',
                )}
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
      {workspaceNavPanel?.portalTargets.map((target, index) =>
        createPortal(conversationNavPanel, target, `messages-nav-${index}`),
      )}
      {isComposerVisible ? null : (
        <>
          {error ? (
            <div
              className="mx-4 mt-3 shrink-0 rounded border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </div>
          ) : null}
          {notice ? (
            <div
              aria-live="polite"
              className="mx-4 mt-3 shrink-0 rounded border border-success/20 bg-success/10 px-3 py-2 text-sm text-success"
              role="status"
            >
              {notice}
            </div>
          ) : null}
        </>
      )}

      <div
        className="flex min-h-0 flex-1 overflow-hidden"
        data-testid="messages-surface-layout"
      >
        {!isConversationNavProjected ? (
          <div className="w-[20rem] shrink-0 border-r border-border">
            {conversationNavPanel}
          </div>
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {selectedConversation ? (
            <>
              <div className="border-b border-border px-5 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <PlatformPill platform={selectedConversation.platform} />
                      <StatusPill status={selectedConversation.status} />
                      {isReadOnly ? (
                        <span className="inline-flex items-center gap-1 rounded bg-warning/10 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wider text-warning">
                          <LockKeyhole aria-hidden="true" className="size-3" />
                          {translate('conversation.readOnly')}
                        </span>
                      ) : null}
                      {selectedConversation.needsReview ? (
                        <span className="inline-flex items-center rounded bg-warning/10 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wider text-warning">
                          {translate('conversation.review')}
                        </span>
                      ) : null}
                    </div>
                    <h2 className="truncate text-base font-semibold text-foreground">
                      {getParticipantLabel(selectedConversation)}
                    </h2>
                    <p className="mt-1 text-xs font-medium text-primary/70">
                      {isDmThread ? 'Direct message' : 'Comment'} ·{' '}
                      {selectedConversation.platform}
                    </p>
                    {isDmThread ? null : (
                      <p className="mt-1 truncate text-xs text-gray-800">
                        {selectedConversation.sourceContentTitle ||
                          selectedConversation.sourceContentUrl ||
                          selectedConversation.externalConversationId}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isAgentDockAvailable ? (
                      <Button
                        data-testid="messages-ask-agent"
                        icon={<Sparkles className="size-4" />}
                        isDisabled={!canAttachReferences}
                        onClick={handleAskAgentAboutConversation}
                        size={ButtonSize.SM}
                        variant={ButtonVariant.GHOST}
                      >
                        {translate('agent.askConversation')}
                      </Button>
                    ) : null}
                    <Button
                      asChild
                      variant={ButtonVariant.GHOST}
                      size={ButtonSize.SM}
                    >
                      <Link href={automationHref}>
                        <Zap className="size-4" />
                        {translate('actions.automation')}
                      </Link>
                    </Button>
                    {selectedConversation.status === 'resolved' ? (
                      <Button
                        variant={ButtonVariant.GHOST}
                        size={ButtonSize.SM}
                        isDisabled={!canWrite || Boolean(busyAction)}
                        isLoading={busyAction === 'status'}
                        onClick={() =>
                          handleStatusChange(
                            'open' satisfies SocialConversationStatus,
                          )
                        }
                      >
                        {translate('actions.reopen')}
                      </Button>
                    ) : (
                      <Button
                        variant={ButtonVariant.GHOST}
                        size={ButtonSize.SM}
                        icon={<CircleCheck className="size-4" />}
                        isDisabled={!canWrite || Boolean(busyAction)}
                        isLoading={busyAction === 'status'}
                        onClick={() =>
                          handleStatusChange(
                            'resolved' satisfies SocialConversationStatus,
                          )
                        }
                      >
                        {translate('actions.resolve')}
                      </Button>
                    )}
                    {selectedConversation.status !== 'needs_review' ? (
                      <Button
                        variant={ButtonVariant.GHOST}
                        size={ButtonSize.SM}
                        isDisabled={!canWrite || Boolean(busyAction)}
                        isLoading={busyAction === 'status'}
                        onClick={() =>
                          handleStatusChange(
                            'needs_review' satisfies SocialConversationStatus,
                          )
                        }
                      >
                        {translate('conversation.needsReview')}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {isLoadingMessages ? (
                  <LazyLoadingFallback variant="minimal" />
                ) : messages.length === 0 ? (
                  <div className="flex h-full min-h-64 items-center justify-center text-sm text-muted-foreground">
                    {translate('empty.noMessages')}
                  </div>
                ) : (
                  messages.map((message) => (
                    <MessageBubble
                      busyAction={busyAction}
                      canAttachReference={canAttachReferences}
                      isReferenced={isMessageReferenced(message)}
                      key={message.id}
                      message={message}
                      onApproveDraft={handleApproveDraft}
                      onRejectDraft={handleRejectDraft}
                      canWrite={canWrite}
                      onToggleReference={
                        isAgentDockAvailable
                          ? handleAskAgentAboutMessage
                          : undefined
                      }
                    />
                  ))
                )}
                {messagePagination.totalPages > 1 ? (
                  <div className="flex items-center justify-center gap-3 pt-3">
                    <Button
                      ariaLabel="Previous messages page"
                      icon={<ChevronLeft className="size-4" />}
                      isDisabled={!messagePagination.hasPrevious}
                      onClick={() =>
                        setMessagePage((page) => Math.max(1, page - 1))
                      }
                      size={ButtonSize.ICON}
                      variant={ButtonVariant.GHOST}
                      withWrapper={false}
                    />
                    <span className="text-xs text-gray-800">
                      {translate('pagination.messagePage', {
                        page: messagePagination.page,
                        pages: messagePagination.totalPages,
                      })}
                    </span>
                    <Button
                      ariaLabel="Next messages page"
                      icon={<ChevronRight className="size-4" />}
                      isDisabled={!messagePagination.hasNext}
                      onClick={() => setMessagePage((page) => page + 1)}
                      size={ButtonSize.ICON}
                      variant={ButtonVariant.GHOST}
                      withWrapper={false}
                    />
                  </div>
                ) : null}
              </div>

              {isReadOnly ? (
                <div
                  className="flex shrink-0 items-center gap-3 border-t border-border bg-background-secondary px-5 py-4"
                  data-testid="messages-read-only-notice"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-warning/10 text-warning ring-1 ring-inset ring-warning/20">
                    <LockKeyhole aria-hidden="true" className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {translate('conversation.readOnly')}
                    </p>
                    <p className="mt-0.5 text-xs text-foreground/48">
                      {availability.postReplyReason}
                    </p>
                  </div>
                </div>
              ) : (
                <MessagesReplyComposer
                  availability={availability}
                  busyAction={busyAction}
                  draft={draft}
                  error={error}
                  notice={notice}
                  onAction={handleAction}
                  onDraftChange={handleDraftChange}
                  onSuggestedReply={handleSuggestedReply}
                  participantLabel={getParticipantLabel(selectedConversation)}
                />
              )}
            </>
          ) : (
            <div
              className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
              data-testid="messages-empty-state"
            >
              <MessageSquare
                aria-hidden="true"
                className="size-10 text-gray-800"
              />
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">
                  {hasConnectedAccounts
                    ? 'Select a conversation'
                    : 'Connect accounts to start your inbox'}
                </p>
                <p className="max-w-sm text-xs leading-5 text-foreground/38">
                  {hasConnectedAccounts
                    ? 'Review the thread, draft a response with the agent, then send or resolve it here.'
                    : 'Comments and direct messages from your connected social channels will appear in the conversation list.'}
                </p>
              </div>
              {!hasConnectedAccounts && availableOAuthConnect ? (
                <AgentOAuthConnectMenu
                  hideIcon
                  onOAuthConnect={availableOAuthConnect}
                  triggerLabel="Connect accounts"
                  triggerSize={ButtonSize.SM}
                  triggerVariant={ButtonVariant.DEFAULT}
                />
              ) : null}
              {!hasConnectedAccounts && !availableOAuthConnect ? (
                <p className="text-2xs leading-4 text-warning">
                  {translate('empty.chooseBrandToConnect')}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
