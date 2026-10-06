'use client';

import {
  BrandOsRevisionStatus,
  ButtonVariant,
  MemberRole,
} from '@genfeedai/contracts';
import { brandGenerationRulesV1Schema } from '@genfeedai/contracts/api-types/contracts';
import type {
  BrandKitFieldKey,
  IBrandKitDraft,
  IBrandKitDraftField,
  IBrandOsExportState,
  IBrandOsRevision,
} from '@genfeedai/contracts/interfaces';
import { BRAND_KIT_FIELD_OWNERSHIP } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useUserRole } from '@hooks/auth/use-user-role/use-user-role';
import type { BrandOsSettingsCardProps } from '@props/pages/brand-os-settings.props';
import { BrandsService } from '@services/social/brands.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import BrandOsGenerationRulesReview from './BrandOsGenerationRulesReview';
import BrandOsIdentityPreview from './BrandOsIdentityPreview';
import BrandOsRevisionFields from './BrandOsRevisionFields';

const AUTO_SAVE_DELAY_MS = 1500;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function useBrandOsDirtyNavigation(
  brandId: string,
  dirty: boolean,
  t: (key: 'confirmLeave') => string,
) {
  useEffect(() => {
    if (!dirty) return;
    function preventUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    function confirmNavigation(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest('a[href]');
      const button = target.closest('button[data-brand-os-navigation]');
      const navigation =
        (link &&
          link.getAttribute('target') !== '_blank' &&
          !link.hasAttribute('download')) ||
        (button instanceof HTMLButtonElement &&
          !button.disabled &&
          button.getAttribute('data-brand-os-navigation') === brandId);
      if (navigation && !window.confirm(t('confirmLeave'))) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    }
    window.addEventListener('beforeunload', preventUnload);
    document.addEventListener('click', confirmNavigation, true);
    return () => {
      window.removeEventListener('beforeunload', preventUnload);
      document.removeEventListener('click', confirmNavigation, true);
    };
  }, [brandId, dirty, t]);
}

export default function BrandOsSettingsCard({
  brandId,
  refreshKey = 0,
  isAutoSaveEnabled = false,
  onRefreshBrand,
  onRevisionSaved,
  onReadinessChange,
  fieldGroups,
  renderWorkspace,
}: BrandOsSettingsCardProps) {
  const t = useTranslations('pages.brandOsSettings');
  const common = useTranslations('common.actions');
  const role = useUserRole();
  const canManage = role === MemberRole.ADMIN || role === MemberRole.OWNER;
  const getService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );
  const [storedRevisions, setRevisions] = useState<IBrandOsRevision[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [storedContent, setContent] = useState<IBrandKitDraft | null>(null);
  const [storedExportState, setExportState] =
    useState<IBrandOsExportState | null>(null);
  const [storedLoading, setLoading] = useState(true);
  const [storedPending, setPending] = useState<string | null>(null);
  const [storedError, setError] = useState<string | null>(null);
  const [storedExportError, setExportError] = useState<string | null>(null);
  const [storedNotice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [loadedEpoch, setLoadedEpoch] = useState(-1);
  const [acknowledgement, setAcknowledgement] = useState<string | null>(null);
  const acknowledgementRef = useRef<string | null>(null);
  const reviewEpoch = useRef(0);
  const mounted = useRef(true);
  const epoch = useRef(0);
  const currentScope = useRef({ brandId, getService, role });
  const currentRefresh = useRef(refreshKey);
  const pendingRef = useRef(false);
  const dirtyRef = useRef(false);
  const autoSaveAttemptRef = useRef<string | null>(null);
  // Bumped by every successful save or approval so a history read that
  // started earlier never replaces newer persisted state.
  const mutationRef = useRef(0);
  if (
    currentScope.current.brandId !== brandId ||
    currentScope.current.getService !== getService ||
    currentScope.current.role !== role
  ) {
    currentScope.current = { brandId, getService, role };
    epoch.current += 1;
    pendingRef.current = false;
    dirtyRef.current = false;
    acknowledgementRef.current = null;
    reviewEpoch.current += 1;
  }
  if (currentRefresh.current !== refreshKey) {
    currentRefresh.current = refreshKey;
    acknowledgementRef.current = null;
    reviewEpoch.current += 1;
  }
  const hasCurrentScope = loadedEpoch === epoch.current;
  const revisions = hasCurrentScope ? storedRevisions : [];
  const content = hasCurrentScope ? storedContent : null;
  const exportState = hasCurrentScope ? storedExportState : null;
  const error = hasCurrentScope ? storedError : null;
  const exportError = hasCurrentScope ? storedExportError : null;
  const notice = hasCurrentScope ? storedNotice : null;
  const pending = hasCurrentScope ? storedPending : null;
  const loading = !hasCurrentScope || storedLoading;
  function isCurrent(operationEpoch: number) {
    return (
      mounted.current &&
      currentScope.current.brandId === brandId &&
      currentScope.current.getService === getService &&
      currentScope.current.role === role &&
      epoch.current === operationEpoch
    );
  }
  function clearAcknowledgement() {
    acknowledgementRef.current = null;
    reviewEpoch.current += 1;
    setAcknowledgement(null);
  }
  function matchesRevisionScope(
    revision: IBrandOsRevision,
    organizationId?: string,
  ) {
    return (
      revision.brandId === brandId &&
      Boolean(revision.organizationId) &&
      (!organizationId || revision.organizationId === organizationId) &&
      (!revision.content.brandId || revision.content.brandId === brandId) &&
      (!revision.content.organizationId ||
        revision.content.organizationId === revision.organizationId)
    );
  }
  const selected = revisions.find((revision) => revision.id === selectedId);
  const contentKey = content ? JSON.stringify(content) : null;
  const dirty = Boolean(
    selected && contentKey && contentKey !== JSON.stringify(selected.content),
  );
  dirtyRef.current = dirty;
  const binding = selected
    ? JSON.stringify([
        epoch.current,
        role,
        brandId,
        selected.organizationId,
        selected.brandId,
        selected.id,
        selected.updatedAt,
        selected.content,
        selected.generationRulesReviewCandidateHash,
      ])
    : null;
  const bindingRef = useRef(binding);
  bindingRef.current = binding;
  const editedContentRef = useRef(content);
  editedContentRef.current = content;
  const hasRules = selected?.content.generationRules !== undefined;
  const parsedRules = hasRules
    ? brandGenerationRulesV1Schema.safeParse(selected?.content.generationRules)
    : null;
  const candidate = selected?.generationRulesReviewCandidateHash;
  const hasCandidate =
    typeof candidate === 'string' &&
    candidate.length === 71 &&
    /^sha256:[0-9a-f]{64}$/.test(candidate);
  const canReview = Boolean(
    selected?.status === BrandOsRevisionStatus.DRAFT &&
      hasRules &&
      parsedRules?.success &&
      hasCandidate,
  );
  const acknowledged = Boolean(
    binding &&
      acknowledgement === binding &&
      acknowledgementRef.current === binding,
  );
  const canApprove = Boolean(
    selected?.status === BrandOsRevisionStatus.DRAFT &&
      canManage &&
      !dirty &&
      !pendingRef.current &&
      (!hasRules || (canReview && acknowledged)),
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      acknowledgementRef.current = null;
      reviewEpoch.current += 1;
      epoch.current += 1;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: authenticated scope changes reset the stored epoch
  useEffect(() => {
    clearAcknowledgement();
    dirtyRef.current = false;
    setRevisions([]);
    setSelectedId('');
    setContent(null);
    setPending(null);
    setNotice(null);
    setError(null);
    setExportError(null);
    setExportState(null);
  }, [brandId, getService, role]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: revision events and explicit refresh reload server history
  useEffect(() => {
    const controller = new AbortController();
    const operationEpoch = epoch.current;
    const mutationAtStart = mutationRef.current;
    async function load() {
      clearAcknowledgement();
      setLoading(true);
      setError(null);
      try {
        const service = await getService();
        if (!isCurrent(operationEpoch) || controller.signal.aborted) return;
        const [revisionResult, exportResult] = await Promise.allSettled([
          service.listBrandOsRevisions(brandId, controller.signal),
          service.getBrandOsExport(brandId, controller.signal),
        ]);
        if (controller.signal.aborted || !isCurrent(operationEpoch)) return;
        if (mutationRef.current !== mutationAtStart) {
          setReload((value) => value + 1);
          return;
        }
        if (revisionResult.status === 'rejected') throw revisionResult.reason;
        const nextRevisions = revisionResult.value;
        const organizationId = nextRevisions[0]?.organizationId;
        if (
          nextRevisions.some(
            (revision) => !matchesRevisionScope(revision, organizationId),
          )
        )
          throw new Error(t('operationFailed'));
        if (
          exportResult.status === 'fulfilled' &&
          exportResult.value.brandId === brandId
        ) {
          setExportState(exportResult.value);
          setExportError(null);
        } else {
          setExportState(null);
          setExportError(
            exportResult.status === 'rejected'
              ? errorMessage(exportResult.reason, t('operationFailed'))
              : t('operationFailed'),
          );
        }
        clearAcknowledgement();
        setLoadedEpoch(operationEpoch);
        if (dirtyRef.current) {
          setNotice(t('newRevisions'));
          return;
        }
        setRevisions(nextRevisions);
        setSelectedId(nextRevisions[0]?.id ?? '');
        setContent(nextRevisions[0]?.content ?? null);
      } catch (loadError) {
        if (!controller.signal.aborted && isCurrent(operationEpoch)) {
          setLoadedEpoch(operationEpoch);
          setError(errorMessage(loadError, t('operationFailed')));
        }
      } finally {
        if (!controller.signal.aborted && isCurrent(operationEpoch))
          setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [brandId, getService, role, refreshKey, reload, t]);

  useBrandOsDirtyNavigation(brandId, dirty, t);

  function changeField(
    key: BrandKitFieldKey,
    update: Partial<IBrandKitDraftField>,
  ) {
    if (!hasCurrentScope || !canManage || pendingRef.current) return;
    clearAcknowledgement();
    setContent((current) => {
      const owner = BRAND_KIT_FIELD_OWNERSHIP.find(
        (entry) => entry.key === key,
      );
      const field: IBrandKitDraftField | null =
        current?.fields[key] ??
        (owner
          ? {
              ...owner,
              applyActionDefault: 'reject',
              evidence: [],
              diagnostics: [],
            }
          : null);
      return current && field
        ? {
            ...current,
            fields: { ...current.fields, [key]: { ...field, ...update } },
          }
        : current;
    });
    setNotice(null);
  }

  async function perform(
    action: string,
    operation: (
      service: BrandsService,
      operationEpoch: number,
    ) => Promise<void>,
  ) {
    if (pendingRef.current || !hasCurrentScope) return;
    const operationEpoch = epoch.current;
    pendingRef.current = true;
    setPending(action);
    setError(null);
    setNotice(null);
    try {
      const service = await getService();
      if (!isCurrent(operationEpoch)) return;
      await operation(service, operationEpoch);
    } catch (operationError) {
      if (isCurrent(operationEpoch)) {
        clearAcknowledgement();
        setError(errorMessage(operationError, t('operationFailed')));
      }
    } finally {
      if (isCurrent(operationEpoch)) {
        pendingRef.current = false;
        setPending(null);
      }
    }
  }

  function saveDraft() {
    clearAcknowledgement();
    if (
      !selected ||
      !content ||
      !canManage ||
      selected.status === BrandOsRevisionStatus.SUPERSEDED
    )
      return;
    const savedBinding = binding;
    const savedContent = JSON.stringify(content);
    if (
      Object.values(content.fields).some(
        (field) =>
          Array.isArray(field?.proposedValue) &&
          field.proposedValue.length > 50,
      )
    ) {
      setError(t('listLimit'));
      return;
    }
    void perform(t('saving'), async (service, operationEpoch) => {
      if (
        bindingRef.current !== savedBinding ||
        JSON.stringify(editedContentRef.current) !== savedContent
      )
        return;
      const saved = await service.updateBrandOsRevision(brandId, selected.id, {
        content,
        updatedAt: selected.updatedAt,
      });
      if (
        !isCurrent(operationEpoch) ||
        bindingRef.current !== savedBinding ||
        JSON.stringify(editedContentRef.current) !== savedContent
      )
        return;
      if (
        !matchesRevisionScope(saved, selected.organizationId) ||
        saved.status !== BrandOsRevisionStatus.DRAFT ||
        (selected.status === BrandOsRevisionStatus.DRAFT &&
          saved.id !== selected.id) ||
        (selected.status === BrandOsRevisionStatus.APPROVED &&
          saved.id === selected.id)
      )
        throw new Error(t('operationFailed'));
      mutationRef.current += 1;
      clearAcknowledgement();
      setRevisions((current) => [
        saved,
        ...current.filter((revision) => revision.id !== saved.id),
      ]);
      setSelectedId(saved.id);
      setContent(saved.content);
      setNotice(t('saved', { version: saved.version }));
      onRevisionSaved?.(saved);
    });
  }

  async function refreshExport(service: BrandsService, operationEpoch: number) {
    if (!isCurrent(operationEpoch)) return;
    try {
      const state = await service.getBrandOsExport(brandId);
      if (!isCurrent(operationEpoch)) return;
      if (state.brandId !== brandId) throw new Error(t('operationFailed'));
      setExportState(state);
      setExportError(null);
    } catch (exportLoadError) {
      if (!isCurrent(operationEpoch)) return;
      setExportState(null);
      setExportError(errorMessage(exportLoadError, t('operationFailed')));
    }
  }

  function approve() {
    if (!selected || !canApprove || pendingRef.current) return;
    const captured = selected;
    const approvalBinding = binding;
    const reviewedHash = hasRules ? candidate : undefined;
    clearAcknowledgement();
    const approvalReviewEpoch = reviewEpoch.current;
    function isApprovalCurrent(operationEpoch: number) {
      return (
        isCurrent(operationEpoch) &&
        canManage &&
        !dirtyRef.current &&
        bindingRef.current === approvalBinding &&
        reviewEpoch.current === approvalReviewEpoch
      );
    }
    void perform(t('approving'), async (service, operationEpoch) => {
      if (!isApprovalCurrent(operationEpoch)) return;
      const approved =
        reviewedHash === undefined
          ? await service.approveBrandOsRevision(
              brandId,
              captured.id,
              captured.updatedAt,
            )
          : await service.approveBrandOsRevision(
              brandId,
              captured.id,
              captured.updatedAt,
              reviewedHash,
            );
      if (!isApprovalCurrent(operationEpoch)) return;
      if (
        !matchesRevisionScope(approved, captured.organizationId) ||
        approved.id !== captured.id ||
        approved.status !== BrandOsRevisionStatus.APPROVED
      )
        throw new Error(t('operationFailed'));
      mutationRef.current += 1;
      setRevisions((current) =>
        current.map((revision) =>
          revision.id === approved.id
            ? approved
            : revision.status === BrandOsRevisionStatus.APPROVED
              ? { ...revision, status: BrandOsRevisionStatus.SUPERSEDED }
              : revision,
        ),
      );
      setContent(approved.content);
      setNotice(t('approved', { version: approved.version }));
      onRevisionSaved?.(approved);
      await refreshExport(service, operationEpoch);
      if (!isCurrent(operationEpoch)) return;
      await onRefreshBrand();
    });
  }

  function download() {
    void perform(t('downloading'), async (service, operationEpoch) => {
      const blob = await service.downloadBrandOsDesign(brandId);
      if (!isCurrent(operationEpoch)) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'design.md';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(t('downloaded'));
    });
  }

  const busy = Boolean(pending);
  const isApproved = selected?.status === BrandOsRevisionStatus.APPROVED;

  // An unresolved role must not read as a member who cannot approve.
  useEffect(() => {
    onReadinessChange?.({
      isLoaded: !loading && role !== undefined,
      canManage,
      isApproved,
      isDirty: dirty,
      isBusy: busy,
    });
  }, [onReadinessChange, loading, role, canManage, isApproved, dirty, busy]);

  // Auto-save goes through the same expected-updatedAt save as the Save
  // button. Content that already failed to save is not retried until it
  // changes again, so a conflict keeps the edits without looping.
  // biome-ignore lint/correctness/useExhaustiveDependencies: saveDraft is recreated every render; the deps capture what it saves
  useEffect(() => {
    if (
      !isAutoSaveEnabled ||
      !dirty ||
      !canManage ||
      busy ||
      loading ||
      !contentKey ||
      selected?.status === BrandOsRevisionStatus.SUPERSEDED ||
      autoSaveAttemptRef.current === contentKey
    )
      return;
    const timer = setTimeout(() => {
      autoSaveAttemptRef.current = contentKey;
      saveDraft();
    }, AUTO_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [
    isAutoSaveEnabled,
    dirty,
    canManage,
    busy,
    loading,
    contentKey,
    selected?.id,
    selected?.updatedAt,
    selected?.status,
  ]);

  const organizationId = revisions[0]?.organizationId ?? '';
  // Any selection, save, approval or history change closes the current preview.
  const identityPreviewKey = JSON.stringify([
    epoch.current,
    loadedEpoch,
    refreshKey,
    reload,
    selectedId,
    selected?.updatedAt ?? null,
    selected?.status ?? null,
    exportState?.revisionId ?? null,
  ]);
  const currentApproved = revisions.find(
    (revision) => revision.id === exportState?.revisionId,
  );
  const publicationOutdated =
    canManage &&
    Boolean(exportState?.publicUrl) &&
    Boolean(exportState?.digest) &&
    exportState?.canPublish &&
    exportState.revisionId !== exportState.publishedRevisionId;

  const review = (
    <Card
      label={t('title')}
      description={t('description')}
      bodyClassName="gap-4 p-4"
    >
      <div
        aria-busy={loading || busy}
        className="space-y-4"
        data-testid="brand-os-settings"
      >
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t('errorPreserved', { error })}
          </p>
        )}
        {(notice || pending) && (
          <p role="status" className="text-sm text-muted-foreground">
            {pending ? t('progress', { action: pending }) : notice}
          </p>
        )}
        {loading ? (
          <p role="status">{t('loading')}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={selectedId}
                onValueChange={(id) => {
                  const revision = revisions.find((entry) => entry.id === id);
                  if (!revision || dirty) return;
                  clearAcknowledgement();
                  setSelectedId(id);
                  setContent(revision.content);
                  setNotice(null);
                }}
                disabled={busy || dirty}
              >
                <SelectTrigger
                  aria-label={t('history')}
                  className="w-full sm:w-80"
                >
                  <SelectValue placeholder={t('noRevisions')} />
                </SelectTrigger>
                <SelectContent>
                  {revisions.map((revision) => (
                    <SelectItem key={revision.id} value={revision.id}>
                      {t('revisionOption', {
                        version: revision.version,
                        status: t(`statuses.${revision.status.toLowerCase()}`),
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                label={t('refresh')}
                variant={ButtonVariant.SECONDARY}
                isDisabled={dirty || busy}
                onClick={() => {
                  clearAcknowledgement();
                  setReload((value) => value + 1);
                }}
              />
            </div>
            {!canManage && (
              <p className="text-sm text-muted-foreground">
                {t('membersReadOnly')}
              </p>
            )}
            {selected && (
              <p className="text-xs text-muted-foreground">
                {t('revisionDetails', {
                  version: selected.version,
                  status: t(`statuses.${selected.status.toLowerCase()}`),
                  date: new Date(selected.updatedAt).toLocaleString('en-US'),
                })}
                {selected.approvedAt
                  ? ` · ${t('approvedDate', { date: new Date(selected.approvedAt).toLocaleString('en-US') })}`
                  : ''}
              </p>
            )}
            {content && (
              <Collapsible defaultOpen={!renderWorkspace}>
                <CollapsibleTrigger>Review identity fields</CollapsibleTrigger>
                <CollapsibleContent>
                  <BrandOsRevisionFields
                    content={content}
                    isDisabled={
                      !canManage ||
                      busy ||
                      selected?.status === BrandOsRevisionStatus.SUPERSEDED
                    }
                    onFieldChange={changeField}
                  />
                </CollapsibleContent>
              </Collapsible>
            )}
            {selected && !hasRules && (
              <p className="text-sm text-muted-foreground">
                {t('generationRulesReview.none')}
              </p>
            )}
            {selected &&
              hasRules &&
              (!parsedRules?.success ||
                (selected.status === BrandOsRevisionStatus.DRAFT &&
                  !hasCandidate)) && (
                <p role="alert" className="text-sm text-destructive">
                  {t('generationRulesReview.unavailable')}
                </p>
              )}
            {selected && parsedRules?.success && (
              <BrandOsGenerationRulesReview
                rules={parsedRules.data}
                acknowledged={acknowledged}
                isDisabled={!canManage || busy || dirty || !canReview}
                showAcknowledgement={
                  selected.status === BrandOsRevisionStatus.DRAFT && canReview
                }
                onAcknowledgedChange={(checked) => {
                  if (
                    !canReview ||
                    !canManage ||
                    dirty ||
                    pendingRef.current ||
                    !binding
                  )
                    return;
                  acknowledgementRef.current = checked ? binding : null;
                  setAcknowledgement(checked ? binding : null);
                }}
              />
            )}
            {!content && (
              <p className="text-sm text-muted-foreground">{t('empty')}</p>
            )}
            {canManage && selected && (
              <div className="flex flex-wrap gap-2">
                <Button
                  label={
                    selected.status === BrandOsRevisionStatus.APPROVED
                      ? t('saveAsDraft')
                      : t('save')
                  }
                  isDisabled={
                    busy ||
                    selected.status === BrandOsRevisionStatus.SUPERSEDED ||
                    (selected.status === BrandOsRevisionStatus.DRAFT && !dirty)
                  }
                  onClick={saveDraft}
                />
                {selected.status === BrandOsRevisionStatus.DRAFT && (
                  <Button
                    label={t('approve')}
                    variant={ButtonVariant.SECONDARY}
                    isDisabled={busy || !canApprove}
                    onClick={approve}
                  />
                )}
                {dirty && (
                  <Button
                    label={t('discard')}
                    variant={ButtonVariant.SECONDARY}
                    isDisabled={busy}
                    onClick={() => {
                      clearAcknowledgement();
                      setContent(selected.content);
                      setNotice(t('discarded'));
                    }}
                  />
                )}
              </div>
            )}
            {dirty && (
              <p role="status" className="text-sm text-muted-foreground">
                {t('unsaved')}
              </p>
            )}
            {organizationId && (
              <div className="border-t border-border pt-4">
                <BrandOsIdentityPreview
                  organizationId={organizationId}
                  brandId={brandId}
                  refreshKey={identityPreviewKey}
                  isDisabled={dirty || busy}
                />
              </div>
            )}
          </>
        )}
        {exportError && (
          <section
            aria-label={t('exportLabel')}
            className="space-y-3 border-t border-border pt-4"
          >
            <h3 className="text-sm font-semibold">{t('exportLabel')}</h3>
            <p role="alert" className="text-sm text-destructive">
              {exportError}
            </p>
            <Button
              label={common('retry')}
              isDisabled={busy || loading}
              variant={ButtonVariant.SECONDARY}
              onClick={() => void perform(t('exportLabel'), refreshExport)}
            />
          </section>
        )}
        {exportState && (
          <div
            className="space-y-3 border-t border-border pt-4"
            role="region"
            aria-label={t('exportLabel')}
          >
            <h3 className="text-sm font-semibold">
              {t('exportTitle', {
                state: t(`visibility.${exportState.state}`),
              })}
            </h3>
            <p className="text-sm text-muted-foreground">
              {exportState.state === 'unavailable' && exportState.revisionId
                ? t('exportInvalid')
                : t(`export.${exportState.state}`)}
            </p>
            {currentApproved && exportState.digest && (
              <p className="text-xs text-muted-foreground">
                {t('downloadVersion', { version: currentApproved.version })}
              </p>
            )}
            {publicationOutdated && (
              <p role="status" className="text-sm text-muted-foreground">
                {t('publicationOutdated')}
              </p>
            )}
            {exportState.publicUrl && (
              <Link
                className="block break-all text-sm underline"
                href={exportState.publicUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('publicLink')}
              </Link>
            )}
            {exportState.revisionUrl && (
              <Link
                className="block break-all text-sm underline"
                href={exportState.revisionUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('revisionLink')}
              </Link>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                label={t('download')}
                isDisabled={busy || !exportState.digest}
                onClick={download}
              />
              {canManage &&
                exportState.canPublish &&
                exportState.revisionId &&
                exportState.digest &&
                (!exportState.publicUrl || publicationOutdated) && (
                  <Button
                    label={
                      publicationOutdated
                        ? t('updatePublication')
                        : t('publish')
                    }
                    variant={ButtonVariant.SECONDARY}
                    isDisabled={busy || dirty}
                    onClick={() => {
                      const revisionId = exportState.revisionId;
                      if (!revisionId) return;
                      void perform(
                        t('publishing'),
                        async (service, operationEpoch) => {
                          const state = await service.publishBrandOsDesign(
                            brandId,
                            revisionId,
                          );
                          if (isCurrent(operationEpoch)) {
                            setExportState(state);
                            setNotice(t('published'));
                          }
                        },
                      );
                    }}
                  />
                )}
              {canManage && exportState.publicUrl && (
                <Button
                  label={t('revoke')}
                  variant={ButtonVariant.SECONDARY}
                  isDisabled={busy}
                  onClick={() =>
                    void perform(
                      t('revoking'),
                      async (service, operationEpoch) => {
                        const state =
                          await service.revokeBrandOsDesign(brandId);
                        if (isCurrent(operationEpoch)) {
                          setExportState(state);
                          setNotice(t('revoked'));
                        }
                      },
                    )
                  }
                />
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
  if (!renderWorkspace) return review;
  return renderWorkspace({
    content,
    approvedContent:
      revisions.find(
        (revision) => revision.status === BrandOsRevisionStatus.APPROVED,
      )?.content ?? null,
    editor: content ? (
      <BrandOsRevisionFields
        content={content}
        groups={fieldGroups}
        showDecisions={false}
        isDisabled={
          !canManage ||
          busy ||
          selected?.status === BrandOsRevisionStatus.SUPERSEDED
        }
        onFieldChange={changeField}
      />
    ) : null,
    review,
    isDirty: dirty,
    isLoading: loading,
    error,
    isSaveDisabled:
      !canManage ||
      busy ||
      !selected ||
      selected.status === BrandOsRevisionStatus.SUPERSEDED ||
      (selected.status === BrandOsRevisionStatus.DRAFT && !dirty),
    onSave: () => {
      void saveDraft();
    },
  });
}
