'use client';

import {
  BrandOsRevisionStatus,
  ButtonVariant,
  MemberRole,
} from '@genfeedai/contracts';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import BrandOsRevisionFields from './BrandOsRevisionFields';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function BrandOsSettingsCard({
  brandId,
  refreshKey = 0,
  onRefreshBrand,
}: BrandOsSettingsCardProps) {
  const t = useTranslations('pages.brandOsSettings');
  const common = useTranslations('common.actions');
  const role = useUserRole();
  const canManage = role === MemberRole.ADMIN || role === MemberRole.OWNER;
  const getService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );
  const [revisions, setRevisions] = useState<IBrandOsRevision[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [content, setContent] = useState<IBrandKitDraft | null>(null);
  const [exportState, setExportState] = useState<IBrandOsExportState | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const mounted = useRef(true);
  const dirtyRef = useRef(false);
  const selected = revisions.find((revision) => revision.id === selectedId);
  const dirty = Boolean(
    selected &&
      content &&
      JSON.stringify(content) !== JSON.stringify(selected.content),
  );
  dirtyRef.current = dirty;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: revision events and explicit refresh reload server history
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const service = await getService();
        const [revisionResult, exportResult] = await Promise.allSettled([
          service.listBrandOsRevisions(brandId, controller.signal),
          service.getBrandOsExport(brandId, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        if (revisionResult.status === 'rejected') throw revisionResult.reason;
        if (exportResult.status === 'fulfilled') {
          setExportState(exportResult.value);
          setExportError(null);
        } else {
          setExportState(null);
          setExportError(
            errorMessage(exportResult.reason, t('operationFailed')),
          );
        }
        const nextRevisions = revisionResult.value;
        if (dirtyRef.current) {
          setNotice(t('newRevisions'));
          return;
        }
        setRevisions(nextRevisions);
        setSelectedId(nextRevisions[0]?.id ?? '');
        setContent(nextRevisions[0]?.content ?? null);
      } catch (loadError) {
        if (!controller.signal.aborted)
          setError(errorMessage(loadError, t('operationFailed')));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [brandId, getService, refreshKey, reload, t]);

  useEffect(() => {
    if (!dirty) return;
    function preventUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    function confirmNavigation(event: MouseEvent) {
      const target = event.target;
      const link = target instanceof Element ? target.closest('a[href]') : null;
      if (
        link &&
        link.getAttribute('target') !== '_blank' &&
        !link.hasAttribute('download') &&
        !window.confirm(t('confirmLeave'))
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener('beforeunload', preventUnload);
    document.addEventListener('click', confirmNavigation, true);
    return () => {
      window.removeEventListener('beforeunload', preventUnload);
      document.removeEventListener('click', confirmNavigation, true);
    };
  }, [dirty, t]);

  function changeField(
    key: BrandKitFieldKey,
    update: Partial<IBrandKitDraftField>,
  ) {
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
    operation: (service: BrandsService) => Promise<void>,
  ) {
    if (pending) return;
    setPending(action);
    setError(null);
    setNotice(null);
    try {
      await operation(await getService());
    } catch (operationError) {
      if (mounted.current)
        setError(errorMessage(operationError, t('operationFailed')));
    } finally {
      if (mounted.current) setPending(null);
    }
  }

  function saveDraft() {
    if (!selected || !content || !canManage) return;
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
    void perform(t('saving'), async (service) => {
      const saved = await service.updateBrandOsRevision(brandId, selected.id, {
        content,
        updatedAt: selected.updatedAt,
      });
      if (!mounted.current) return;
      setRevisions((current) => [
        saved,
        ...current.filter((revision) => revision.id !== saved.id),
      ]);
      setSelectedId(saved.id);
      setContent(saved.content);
      setNotice(t('saved', { version: saved.version }));
    });
  }

  async function refreshExport(service: BrandsService) {
    try {
      const state = await service.getBrandOsExport(brandId);
      if (!mounted.current) return;
      setExportState(state);
      setExportError(null);
    } catch (exportLoadError) {
      if (!mounted.current) return;
      setExportState(null);
      setExportError(errorMessage(exportLoadError, t('operationFailed')));
    }
  }

  function approve() {
    if (!selected || dirty || !canManage) return;
    void perform(t('approving'), async (service) => {
      const approved = await service.approveBrandOsRevision(
        brandId,
        selected.id,
        selected.updatedAt,
      );
      if (!mounted.current) return;
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
      await refreshExport(service);
      await onRefreshBrand();
    });
  }

  function download() {
    void perform(t('downloading'), async (service) => {
      const blob = await service.downloadBrandOsDesign(brandId);
      if (!mounted.current) return;
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
  const currentApproved = revisions.find(
    (revision) => revision.id === exportState?.revisionId,
  );
  const publicationOutdated =
    canManage &&
    Boolean(exportState?.publicUrl) &&
    Boolean(exportState?.digest) &&
    exportState?.canPublish &&
    exportState.revisionId !== exportState.publishedRevisionId;

  return (
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
                onClick={() => setReload((value) => value + 1)}
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
              <BrandOsRevisionFields
                content={content}
                isDisabled={
                  !canManage ||
                  busy ||
                  selected?.status === BrandOsRevisionStatus.SUPERSEDED
                }
                onFieldChange={changeField}
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
                    isDisabled={busy || dirty}
                    onClick={approve}
                  />
                )}
                {dirty && (
                  <Button
                    label={t('discard')}
                    variant={ButtonVariant.SECONDARY}
                    isDisabled={busy}
                    onClick={() => {
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
                      void perform(t('publishing'), async (service) => {
                        const state = await service.publishBrandOsDesign(
                          brandId,
                          revisionId,
                        );
                        if (mounted.current) {
                          setExportState(state);
                          setNotice(t('published'));
                        }
                      });
                    }}
                  />
                )}
              {canManage && exportState.publicUrl && (
                <Button
                  label={t('revoke')}
                  variant={ButtonVariant.SECONDARY}
                  isDisabled={busy}
                  onClick={() =>
                    void perform(t('revoking'), async (service) => {
                      const state = await service.revokeBrandOsDesign(brandId);
                      if (mounted.current) {
                        setExportState(state);
                        setNotice(t('revoked'));
                      }
                    })
                  }
                />
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
