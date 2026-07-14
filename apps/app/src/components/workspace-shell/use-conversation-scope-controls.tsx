'use client';

import {
  type AgentApiService,
  type AgentThread,
  runAgentApiEffect,
  useAgentChatStore,
} from '@genfeedai/agent';
import {
  clearConversationComposerDraft,
  readConversationComposerDraft,
  writeConversationComposerAttachments,
  writeConversationComposerDocument,
} from '@genfeedai/agent/stores/conversation-composer-draft.store';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  getBrandEntityId,
  getBrandOrganizationId,
  getBrandOrganizationSlug,
} from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { Brand } from '@genfeedai/models/organization/brand.model';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import { cn } from '@helpers/formatting/cn/cn.util';
import SwitcherDropdown from '@ui/menus/switcher-dropdown/SwitcherDropdown';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { useRouter } from 'next/navigation';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  HiChevronDown,
  HiOutlineBuildingOffice2,
  HiOutlineTag,
} from 'react-icons/hi2';
import {
  buildConversationScopeHref,
  buildOrganizationNewThreadHref,
  buildScopedThreadHref,
} from '@/lib/workspace-shell/conversation-scope-location';
import { resolveWorkspaceShellRoute } from '@/lib/workspace-shell/workspace-shell-registry';

const CONTEXT_STORAGE_PREFIX = 'genfeed:agent-thread-context:v1';

interface OrganizationOption {
  readonly id: string;
  readonly isActive: boolean;
  readonly label: string;
  readonly slug: string;
}

interface AuthoritativeContextNotice {
  readonly brandId: string | null;
  readonly contextVersion: number;
  readonly organizationId: string;
  readonly threadId: string;
}

type PendingScopeChange =
  | { readonly kind: 'brand'; readonly brand: Brand | null }
  | {
      readonly kind: 'organization';
      readonly organization: OrganizationOption;
    };

interface UseConversationScopeControlsParams {
  readonly activeThread: AgentThread | null;
  readonly apiService: AgentApiService;
  readonly currentDraftScopeKey: string;
  readonly pathname: string;
  readonly searchParams: URLSearchParams;
}

export interface ConversationScopeControlsState {
  readonly contextLabel: string;
  readonly inspectorScope: ReactNode;
  readonly isConsequentiallyBlocked: boolean;
  readonly scopeControls: ReactNode;
}

function contextStorageKey(threadId: string): string {
  return `${CONTEXT_STORAGE_PREFIX}:${threadId}`;
}

function hasDraftContent(scopeKey: string): boolean {
  const draft = readConversationComposerDraft(scopeKey);
  return Boolean(draft.plainText.trim() || draft.attachments.length > 0);
}

function plainTextDocument(plainText: string) {
  return {
    content: [
      {
        content: plainText ? [{ text: plainText, type: 'text' }] : undefined,
        type: 'paragraph',
      },
    ],
    type: 'doc',
  };
}

function preserveDraftText(
  sourceScopeKey: string,
  targetScopeKey: string,
): void {
  const draft = readConversationComposerDraft(sourceScopeKey);
  writeConversationComposerDocument(
    targetScopeKey,
    plainTextDocument(draft.plainText),
    draft.plainText,
  );
  writeConversationComposerAttachments(targetScopeKey, []);
}

function parseContextNotice(
  value: string | null,
): AuthoritativeContextNotice | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<AuthoritativeContextNotice>;
    if (typeof parsed.brandId !== 'string' && parsed.brandId !== null) {
      return null;
    }
    if (
      typeof parsed.contextVersion !== 'number' ||
      typeof parsed.organizationId !== 'string' ||
      typeof parsed.threadId !== 'string'
    ) {
      return null;
    }
    return parsed as AuthoritativeContextNotice;
  } catch {
    return null;
  }
}

function publishContextNotice(thread: AgentThread): void {
  if (!thread.organizationId) {
    return;
  }

  try {
    window.localStorage.setItem(
      contextStorageKey(thread.id),
      JSON.stringify({
        brandId: thread.brandId ?? null,
        contextVersion: thread.contextVersion,
        organizationId: thread.organizationId,
        threadId: thread.id,
      } satisfies AuthoritativeContextNotice),
    );
  } catch {
    // Focus revalidation remains the server-authoritative fallback.
  }
}

function ScopeTrigger({
  icon,
  isOpen,
  label,
}: {
  readonly icon: ReactNode;
  readonly isOpen: boolean;
  readonly label: string;
}) {
  return (
    <Button
      ariaLabel={`Change ${label} scope`}
      className="h-7 max-w-44 gap-1.5 px-2 text-[11px]"
      icon={icon}
      size={ButtonSize.SM}
      variant={ButtonVariant.GHOST}
      withWrapper={false}
    >
      <span className="truncate">{label}</span>
      <HiChevronDown
        aria-hidden="true"
        className={cn('size-3 transition-transform', isOpen && 'rotate-180')}
      />
    </Button>
  );
}

export function useConversationScopeControls({
  activeThread,
  apiService,
  currentDraftScopeKey,
  pathname,
  searchParams,
}: UseConversationScopeControlsParams): ConversationScopeControlsState {
  const { push, replace } = useRouter();
  const {
    brandId: globalBrandId,
    brands,
    organizationId: globalOrganizationId,
  } = useBrand();
  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );
  const activeRunStatus = useAgentChatStore((state) => state.activeRunStatus);
  const isGenerating = useAgentChatStore((state) => state.isGenerating);
  const resetActiveConversationState = useAgentChatStore(
    (state) => state.resetActiveConversationState,
  );
  const setActiveThread = useAgentChatStore((state) => state.setActiveThread);
  const upsertThread = useAgentChatStore((state) => state.upsertThread);
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [isLoadingOrganizations, setIsLoadingOrganizations] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [pendingChange, setPendingChange] = useState<PendingScopeChange | null>(
    null,
  );
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [staleContext, setStaleContext] =
    useState<AuthoritativeContextNotice | null>(null);

  const currentOrganizationId =
    activeThread?.organizationId ?? globalOrganizationId;
  const effectiveOrganization =
    organizations.find(
      (organization) => organization.id === currentOrganizationId,
    ) ?? organizations.find((organization) => organization.isActive);
  const organizationBrand = brands.find(
    (brand) => getBrandOrganizationId(brand) === currentOrganizationId,
  );
  const currentOrganizationSlug =
    effectiveOrganization?.slug ||
    getBrandOrganizationSlug(organizationBrand) ||
    pathname.split('/').filter(Boolean)[0] ||
    '';
  const effectiveBrandId = activeThread
    ? (activeThread.brandId ?? null)
    : globalBrandId || null;
  const authorizedBrands = useMemo(
    () =>
      brands.filter(
        (brand) => getBrandOrganizationId(brand) === currentOrganizationId,
      ),
    [brands, currentOrganizationId],
  );
  const effectiveBrand = authorizedBrands.find(
    (brand) => getBrandEntityId(brand) === effectiveBrandId,
  );
  const isActiveWork =
    isGenerating ||
    activeRunStatus === 'running' ||
    activeRunStatus === 'cancelling' ||
    activeThread?.runStatus === 'queued' ||
    activeThread?.runStatus === 'running' ||
    activeThread?.runStatus === 'waiting_input';
  const isStale = Boolean(
    staleContext &&
      activeThread &&
      staleContext.threadId === activeThread.id &&
      staleContext.contextVersion > activeThread.contextVersion,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const service = await getOrganizationsService();
        const nextOrganizations = await service.getMyOrganizations();
        if (!cancelled) {
          setOrganizations(nextOrganizations);
          setScopeError(null);
        }
      } catch {
        if (!cancelled) {
          setScopeError('Authorized organizations could not be loaded.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingOrganizations(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getOrganizationsService]);

  const observeLatestThread = useCallback(async () => {
    if (!activeThread) {
      return null;
    }
    try {
      const latest = await runAgentApiEffect(
        apiService.getThreadEffect(activeThread.id),
      );
      if (latest.contextVersion > activeThread.contextVersion) {
        setStaleContext({
          brandId: latest.brandId ?? null,
          contextVersion: latest.contextVersion,
          organizationId:
            latest.organizationId ?? activeThread.organizationId ?? '',
          threadId: latest.id,
        });
      }
      return latest;
    } catch {
      return null;
    }
  }, [activeThread, apiService]);

  useEffect(() => {
    if (!activeThread) {
      return;
    }

    const handleStorage = (event: StorageEvent): void => {
      if (event.key !== contextStorageKey(activeThread.id)) {
        return;
      }
      const notice = parseContextNotice(event.newValue);
      if (
        notice &&
        notice.threadId === activeThread.id &&
        notice.contextVersion > activeThread.contextVersion
      ) {
        setStaleContext(notice);
      }
    };
    const handleFocus = (): void => {
      void observeLatestThread();
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', handleFocus);
    };
  }, [activeThread, observeLatestThread]);

  const routeForThreadContext = useCallback(
    (nextThread: AgentThread, history: 'push' | 'replace') => {
      const nextBrand = authorizedBrands.find(
        (brand) => getBrandEntityId(brand) === nextThread.brandId,
      );
      const nextHref = buildConversationScopeHref({
        brandSlug: nextBrand?.slug ?? null,
        organizationSlug: currentOrganizationSlug,
        pathname,
        searchParams,
        threadId: nextThread.id,
      });
      const requestedPathname = nextHref.split('?')[0] ?? nextHref;
      const authorizedHref = resolveWorkspaceShellRoute(requestedPathname)
        ? nextHref
        : buildScopedThreadHref(
            currentOrganizationSlug,
            nextBrand?.slug ?? null,
            nextThread.id,
          );
      if (history === 'replace') {
        replace(authorizedHref);
      } else {
        push(authorizedHref);
      }
    },
    [
      authorizedBrands,
      currentOrganizationSlug,
      pathname,
      push,
      replace,
      searchParams,
    ],
  );

  const synchronize = useCallback(async () => {
    if (!activeThread || isMutating) {
      return;
    }
    setIsMutating(true);
    setScopeError(null);
    try {
      const latest = await runAgentApiEffect(
        apiService.getThreadEffect(activeThread.id),
      );
      const nextDraftScopeKey = `${currentOrganizationSlug}:${latest.id}:${latest.contextVersion}`;
      preserveDraftText(currentDraftScopeKey, nextDraftScopeKey);
      upsertThread(latest);
      routeForThreadContext(latest, 'replace');
      setStaleContext(null);
    } catch {
      setScopeError('Conversation scope could not be synchronized.');
    } finally {
      setIsMutating(false);
    }
  }, [
    activeThread,
    apiService,
    currentDraftScopeKey,
    currentOrganizationSlug,
    isMutating,
    routeForThreadContext,
    upsertThread,
  ]);

  const applyBrandChange = useCallback(
    async (brand: Brand | null) => {
      const nextBrandId = brand ? getBrandEntityId(brand) : null;
      if (
        nextBrandId !== null &&
        (!nextBrandId ||
          !authorizedBrands.some(
            (candidate) => getBrandEntityId(candidate) === nextBrandId,
          ))
      ) {
        setScopeError('That brand is not authorized for this organization.');
        return;
      }

      setIsMutating(true);
      setScopeError(null);
      try {
        if (!activeThread) {
          const created = await runAgentApiEffect(
            apiService.createThreadEffect({ brandId: nextBrandId }),
          );
          const nextDraftScopeKey = `${currentOrganizationSlug}:${created.id}:${created.contextVersion}`;
          preserveDraftText(currentDraftScopeKey, nextDraftScopeKey);
          upsertThread(created);
          setActiveThread(created.id);
          push(
            buildScopedThreadHref(
              currentOrganizationSlug,
              brand?.slug ?? null,
              created.id,
            ),
          );
          publishContextNotice(created);
          return;
        }

        const updated = await runAgentApiEffect(
          apiService.updateThreadContextEffect(activeThread.id, {
            brandId: nextBrandId,
            expectedContextVersion: activeThread.contextVersion,
          }),
        );
        const nextDraftScopeKey = `${currentOrganizationSlug}:${updated.id}:${updated.contextVersion}`;
        preserveDraftText(currentDraftScopeKey, nextDraftScopeKey);
        upsertThread(updated);
        routeForThreadContext(updated, 'push');
        publishContextNotice(updated);
        setStaleContext(null);
      } catch {
        await observeLatestThread();
        setScopeError(
          'Brand scope was rejected or changed elsewhere. Synchronize before retrying.',
        );
      } finally {
        setIsMutating(false);
      }
    },
    [
      activeThread,
      apiService,
      authorizedBrands,
      currentDraftScopeKey,
      currentOrganizationSlug,
      observeLatestThread,
      push,
      routeForThreadContext,
      setActiveThread,
      upsertThread,
    ],
  );

  const applyOrganizationChange = useCallback(
    async (organization: OrganizationOption) => {
      if (
        !organizations.some((candidate) => candidate.id === organization.id)
      ) {
        setScopeError('That organization is not authorized.');
        return;
      }
      setIsMutating(true);
      setScopeError(null);
      try {
        const service = await getOrganizationsService();
        await service.switchOrganization(organization.id);
        clearConversationComposerDraft(currentDraftScopeKey);
        setActiveThread(null);
        resetActiveConversationState();
        window.location.assign(
          buildOrganizationNewThreadHref(organization.slug),
        );
      } catch {
        setScopeError('Organization switch was rejected.');
        setIsMutating(false);
      }
    },
    [
      currentDraftScopeKey,
      getOrganizationsService,
      organizations,
      resetActiveConversationState,
      setActiveThread,
    ],
  );

  const requestScopeChange = useCallback(
    (change: PendingScopeChange) => {
      if (isStale) {
        setScopeError('Synchronize this tab before changing scope.');
        return;
      }
      if (isActiveWork || hasDraftContent(currentDraftScopeKey)) {
        setPendingChange(change);
        return;
      }
      if (change.kind === 'brand') {
        void applyBrandChange(change.brand);
      } else {
        void applyOrganizationChange(change.organization);
      }
    },
    [
      applyBrandChange,
      applyOrganizationChange,
      currentDraftScopeKey,
      isActiveWork,
      isStale,
    ],
  );

  const confirmPendingChange = useCallback(() => {
    if (!pendingChange || isActiveWork) {
      return;
    }
    const change = pendingChange;
    setPendingChange(null);
    if (change.kind === 'brand') {
      void applyBrandChange(change.brand);
    } else {
      void applyOrganizationChange(change.organization);
    }
  }, [applyBrandChange, applyOrganizationChange, isActiveWork, pendingChange]);

  const organizationLabel =
    effectiveOrganization?.label ?? currentOrganizationSlug ?? 'Organization';
  const brandLabel = effectiveBrand?.label ?? 'Organization-wide';
  const contextLabel = `${organizationLabel} · ${brandLabel}`;
  const scopeControls = (
    <>
      {isStale ? (
        <Button
          className="h-7 px-2 text-[11px]"
          isDisabled={isMutating}
          onClick={() => void synchronize()}
          size={ButtonSize.SM}
          variant={ButtonVariant.OUTLINE}
          withWrapper={false}
        >
          Synchronize scope
        </Button>
      ) : null}
      <SwitcherDropdown
        className="w-auto"
        emptyMessage="No authorized organizations"
        hasSearch={organizations.length >= 5}
        isDisabled={isMutating || isStale}
        isLoading={isLoadingOrganizations}
        items={organizations.map((organization) => ({
          id: organization.id,
          isActive: organization.id === currentOrganizationId,
          label: organization.label,
        }))}
        onSelect={(id) => {
          const organization = organizations.find((item) => item.id === id);
          if (organization && organization.id !== currentOrganizationId) {
            requestScopeChange({ kind: 'organization', organization });
          }
        }}
        renderTrigger={({ isOpen }) => (
          <ScopeTrigger
            icon={<HiOutlineBuildingOffice2 className="size-3.5" />}
            isOpen={isOpen}
            label={organizationLabel}
          />
        )}
        searchPlaceholder="Search organizations…"
      />
      <SwitcherDropdown
        className="w-auto"
        emptyMessage="No authorized brands"
        hasSearch={authorizedBrands.length >= 5}
        isDisabled={isMutating || isStale}
        isLoading={false}
        items={[
          {
            id: '__organization__',
            isActive: effectiveBrandId === null,
            label: 'Organization-wide',
          },
          ...authorizedBrands.map((brand) => ({
            id: getBrandEntityId(brand),
            imageUrl: brand.logoUrl,
            isActive: getBrandEntityId(brand) === effectiveBrandId,
            label: brand.label ?? 'Untitled brand',
          })),
        ]}
        onSelect={(id) => {
          if (id === '__organization__' && effectiveBrandId !== null) {
            requestScopeChange({ brand: null, kind: 'brand' });
            return;
          }
          const brand = authorizedBrands.find(
            (item) => getBrandEntityId(item) === id,
          );
          if (brand && id !== effectiveBrandId) {
            requestScopeChange({ brand, kind: 'brand' });
          }
        }}
        renderTrigger={({ isOpen }) => (
          <ScopeTrigger
            icon={<HiOutlineTag className="size-3.5" />}
            isOpen={isOpen}
            label={brandLabel}
          />
        )}
        searchPlaceholder="Search brands…"
      />

      <Dialog
        open={pendingChange !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingChange(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isActiveWork
                ? 'Stop active work before switching scope'
                : pendingChange?.kind === 'organization'
                  ? 'Start a clean organization thread?'
                  : 'Change the thread brand?'}
            </DialogTitle>
            <DialogDescription>
              {isActiveWork
                ? 'The current run must be stopped from the prompt bar before its organization or brand can change.'
                : pendingChange?.kind === 'organization'
                  ? 'The unsent draft, attachments, transcript, artifact references, and open organization surfaces will not carry to the new thread.'
                  : 'Your unsent text will remain. Attachments and structured references are cleared so resources from the previous brand cannot execute in the new scope.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setPendingChange(null)}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            >
              Cancel
            </Button>
            <Button
              isDisabled={isActiveWork || isMutating}
              onClick={confirmPendingChange}
              variant={ButtonVariant.DEFAULT}
              withWrapper={false}
            >
              {pendingChange?.kind === 'organization'
                ? 'Start clean thread'
                : 'Change brand'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  const inspectorScope = (
    <div
      aria-live="polite"
      className="rounded-lg border border-border bg-background px-3 py-2"
      data-testid="workspace-effective-scope"
    >
      <p className="text-xs font-medium text-foreground">{organizationLabel}</p>
      <p className="mt-1 text-xs text-muted-foreground">{brandLabel}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {activeThread
          ? `Thread context v${activeThread.contextVersion}`
          : 'New thread scope'}
        {isStale ? ' · synchronization required' : ''}
      </p>
      {scopeError ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {scopeError}
        </p>
      ) : null}
    </div>
  );

  return {
    contextLabel,
    inspectorScope,
    isConsequentiallyBlocked: isStale,
    scopeControls,
  };
}
