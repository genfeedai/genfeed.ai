'use client';

import { useAgentChatStore } from '@genfeedai/agent';
import { AgentOAuthConnectMenu } from '@genfeedai/agent/components/AgentOAuthConnectMenu';
import { APP_ROUTES } from '@genfeedai/constants';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { getBrandEntityId } from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import {
  ButtonSize,
  ButtonVariant,
  Platform,
  SocialConversationType,
} from '@genfeedai/enums';
import type {
  SocialAutomationState,
  SocialConversationStatus,
} from '@genfeedai/interfaces';
import type { SocialMessageModel } from '@genfeedai/models/social/social-message.model';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { usePlatformOAuthConnect } from '@hooks/auth/use-platform-oauth-connect/use-platform-oauth-connect';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { SocialMessagesService } from '@services/social/messages.service';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  LinkIcon,
  LockKeyhole,
  MessageSquare,
  Send,
  Sparkles,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';

import { useWorkspaceNavPanel } from '@/components/workspace-shell/WorkspaceNavPanelContext';

import {
  getParticipantLabel,
  MessagesConversationSidebar,
} from './messages-conversation-sidebar';
import {
  ALL_BRANDS_FILTER,
  AUTOMATION_OPTIONS,
  formatMessageTime,
  getMessageProvenanceItems,
  SELECTED_CONVERSATION_PARAM,
  STATUS_LABELS,
  STATUS_STYLES,
} from './messages-page.helpers';
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
  Platform.UNIPILE,
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
  isReferenced,
  message,
  onApproveDraft,
  onRejectDraft,
  onToggleReference,
}: {
  busyAction: string | null;
  canAttachReference: boolean;
  isReferenced: boolean;
  message: SocialMessageModel;
  onApproveDraft: (messageId: string) => void;
  onRejectDraft: (messageId: string) => void;
  onToggleReference: (message: SocialMessageModel) => void;
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
              isDisabled={Boolean(busyAction)}
              isLoading={busyAction === `approve:${message.id}`}
              onClick={() => onApproveDraft(message.id)}
            >
              {translate('actions.approve')}
            </Button>
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              isDisabled={Boolean(busyAction)}
              isLoading={busyAction === `reject:${message.id}`}
              onClick={() => onRejectDraft(message.id)}
            >
              {translate('actions.reject')}
            </Button>
          </div>
        ) : null}
        <div className="mt-2 flex justify-end border-t border-border pt-2">
          <Button
            ariaLabel={
              isReferenced
                ? 'Remove message from agent context'
                : 'Attach message to agent context'
            }
            icon={<LinkIcon className="size-3.5" />}
            isDisabled={!canAttachReference}
            onClick={() => onToggleReference(message)}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            {isReferenced ? 'Referenced' : 'Reference'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  const translate = useTranslations('common.messages');
  const { brandSlug, href } = useOrgUrl();
  const {
    brands,
    credentialsLoading,
    isBrandScopeResolved,
    organizationId: scopedOrganizationId,
  } = useBrand();
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
  const seedAgentComposer = useAgentChatStore((state) => state.seedComposer);
  const setAgentOpen = useAgentChatStore((state) => state.setIsOpen);

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
  const hasConnectedAccounts = useMemo(
    () =>
      inboxBrands.some((brand) =>
        (brand.credentials ?? []).some(
          (credential) =>
            credential.isConnected === true &&
            MESSAGE_CREDENTIAL_PLATFORMS.has(
              String(credential.platform).toLowerCase() as Platform,
            ),
        ),
      ),
    [inboxBrands],
  );
  const hasSyncableAccounts = useMemo(
    () =>
      inboxBrands.some((brand) =>
        (brand.credentials ?? []).some(
          (credential) =>
            credential.isConnected === true &&
            SYNCABLE_MESSAGE_CREDENTIAL_PLATFORMS.has(
              String(credential.platform).toLowerCase() as Platform,
            ),
        ),
      ),
    [inboxBrands],
  );
  const isAccountsLoading =
    credentialsLoading || isBrandScopeResolved === false;
  const connectionBrandId =
    filters.brandFilter !== ALL_BRANDS_FILTER
      ? filters.brandFilter
      : (routeBrandId ??
        (brandOptions.length === 1 ? brandOptions[0]?.id : undefined));

  const updateSelectedConversationParam = useCallback(
    (conversationId: string | null) => {
      const nextSearchParams = new URLSearchParams(searchParamsString);

      if (conversationId) {
        nextSearchParams.set(SELECTED_CONVERSATION_PARAM, conversationId);
      } else {
        nextSearchParams.delete(SELECTED_CONVERSATION_PARAM);
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
    searchParams.get(SELECTED_CONVERSATION_PARAM) ?? null;

  const {
    connectionState,
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

  const canAttachReferences = Boolean(
    activeThreadId &&
      activeThread?.brandId &&
      selectedConversation?.brandId === activeThread.brandId,
  );

  const {
    busyAction,
    draft,
    error: actionError,
    handleAction,
    handleApproveDraft,
    handleDraftChange,
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
    conversationType: filters.conversationType,
    getMessagesService,
    loadConversations,
    onLoadError: setLoadError,
    refreshSelectedThread,
    selectedConversation,
    selectedId,
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

  useMessagesSurfaceAdapter({
    canAttachReferences,
    isConversationReferenced,
    onToggleConversationReference: handleToggleConversationReference,
    references,
    selectedConversation,
  });

  // A DM has no post or comment behind it, so the thread reads top-to-bottom
  // on its own instead of hanging off a source-content anchor.
  const isDmThread =
    selectedConversation?.conversationType === SocialConversationType.DM;
  const isTikTokReadOnly = selectedConversation?.platform === Platform.TIKTOK;

  const handleDraftWithAgent = useCallback(() => {
    if (
      !activeThreadId ||
      !selectedConversation ||
      !canAttachReferences ||
      isTikTokReadOnly
    ) {
      return;
    }

    if (!isConversationReferenced) {
      handleToggleConversationReference();
    }

    const replyKind = isDmThread ? 'direct-message response' : 'public reply';
    seedAgentComposer(
      `Draft a concise ${replyKind} for the selected Messages conversation. Match the brand voice, answer the sender's actual point, and do not publish or send anything until I approve it.`,
      activeThreadId,
    );
    setAgentOpen(true);
  }, [
    activeThreadId,
    canAttachReferences,
    handleToggleConversationReference,
    isConversationReferenced,
    isDmThread,
    isTikTokReadOnly,
    seedAgentComposer,
    selectedConversation,
    setAgentOpen,
  ]);
  const availability = isTikTokReadOnly
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
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="text-2xs font-medium text-foreground/54">
          {translate('actions.automation')}
        </p>
        <Select
          value={filters.automationState}
          onValueChange={(value) => {
            filters.setAutomationState(value as SocialAutomationState | 'all');
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={translate('actions.automation')} />
          </SelectTrigger>
          <SelectContent>
            {AUTOMATION_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Input
        label="Credential or account ID"
        value={filters.credentialId}
        onChange={(event) => {
          filters.setCredentialId(event.target.value);
        }}
      />
      <Input
        label="Assigned owner ID"
        value={filters.assignedOwnerId}
        onChange={(event) => {
          filters.setAssignedOwnerId(event.target.value);
        }}
      />
    </div>
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
      connectionState={connectionState}
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
        updateSelectedConversationParam(null);
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
    />
  );
  const isConversationNavProjected = workspaceNavPanel !== null;
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <h1 className="sr-only">{translate('title')}</h1>
      {workspaceNavPanel?.portalTarget
        ? createPortal(conversationNavPanel, workspaceNavPanel.portalTarget)
        : null}
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
                      {isTikTokReadOnly ? (
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
                        isDisabled={Boolean(busyAction)}
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
                        isDisabled={Boolean(busyAction)}
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
                        isDisabled={Boolean(busyAction)}
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
                      onToggleReference={handleToggleMessageReference}
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

              {isTikTokReadOnly ? (
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
                <div className="border-t border-border p-4">
                  <div className="mb-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {translate('replyComposer.title')}
                        </p>
                        <p className="mt-1 text-xs text-foreground/45">
                          {translate('replyComposer.description')}
                        </p>
                      </div>
                      <Button
                        icon={<Sparkles className="size-4" />}
                        isDisabled={!canAttachReferences || Boolean(busyAction)}
                        onClick={handleDraftWithAgent}
                        size={ButtonSize.SM}
                        title={
                          canAttachReferences
                            ? 'Attach this conversation and draft with the agent'
                            : 'Select an agent thread for this brand first'
                        }
                        variant={ButtonVariant.SECONDARY}
                      >
                        {translate('actions.draftWithAgent')}
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    aria-label="Social reply or direct message"
                    className="min-h-24 w-full"
                    placeholder="Write a reply or DM"
                    rows={4}
                    value={draft}
                    onChange={handleDraftChange}
                  />
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-gray-800">
                      {availability.canSendDm
                        ? 'DM is available for this thread.'
                        : availability.sendDmReason}
                    </p>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        variant={ButtonVariant.GHOST}
                        size={ButtonSize.SM}
                        isDisabled={Boolean(busyAction) || !draft.trim()}
                        isLoading={busyAction === 'draft'}
                        onClick={() => handleAction('draft')}
                      >
                        {translate('actions.saveDraft')}
                      </Button>
                      <Button
                        variant={ButtonVariant.DEFAULT}
                        size={ButtonSize.SM}
                        icon={<Send className="size-4" />}
                        isDisabled={
                          Boolean(busyAction) ||
                          !draft.trim() ||
                          !availability.canPostReply
                        }
                        isLoading={busyAction === 'reply'}
                        title={availability.postReplyReason}
                        onClick={() => handleAction('reply')}
                      >
                        {translate('actions.reply')}
                      </Button>
                      <Button
                        variant={ButtonVariant.GHOST}
                        size={ButtonSize.SM}
                        isDisabled={
                          Boolean(busyAction) ||
                          !draft.trim() ||
                          !availability.canSendDm
                        }
                        isLoading={busyAction === 'dm'}
                        title={availability.sendDmReason}
                        onClick={() => handleAction('dm')}
                      >
                        {translate('actions.dm')}
                      </Button>
                    </div>
                  </div>
                </div>
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
