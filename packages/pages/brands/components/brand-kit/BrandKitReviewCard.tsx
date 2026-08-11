'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import {
  BRAND_KIT_FIELD_OWNERSHIP,
  type BrandKitAssetImportStatus,
  type BrandKitAssetRole,
  type BrandKitFieldGroup,
  type BrandKitFieldKey,
  type IBrandKitApplyResult,
  type IBrandKitAssetCandidate,
  type IBrandKitAssetImportResponse,
  type IBrandKitAssetValue,
  type IBrandKitDiagnostic,
  type IBrandKitDraft,
  type IBrandKitDraftField,
} from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { BrandKitReviewCardProps } from '@props/pages/brand-detail.props';
import { logger } from '@services/core/logger.service';
import { BrandsService } from '@services/social/brands.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { useCallback, useMemo, useState } from 'react';
import BrandKitAssetGrid from './BrandKitAssetGrid';
import BrandKitAssetTile from './BrandKitAssetTile';

/** Readable field inside the scan strip — light surface, not invisible ghost. */
const INLINE_INPUT_CLASSNAME =
  'h-8 border-0 bg-transparent px-2.5 text-sm text-foreground shadow-none placeholder:text-muted-foreground/80 focus-visible:border-0 focus-visible:ring-0';

const FIELD_GROUP_LABELS: Record<BrandKitFieldGroup, string> = {
  assets: 'Assets',
  links: 'Links',
  profile: 'Profile',
  strategy: 'Strategy',
  visual: 'Visual',
  voice: 'Voice',
};

const FIELD_GROUP_ORDER: readonly BrandKitFieldGroup[] = [
  'profile',
  'visual',
  'voice',
  'strategy',
  'links',
  'assets',
];

const DEFERRED_REVIEW_FIELDS = new Set<BrandKitFieldKey>([
  'banner',
  'logo',
  'references',
  'socialLinks',
]);

/** Asset-valued fields are reviewed as pictures and land through asset import. */
const ASSET_FIELDS = new Set<BrandKitFieldKey>(
  BRAND_KIT_FIELD_OWNERSHIP.filter(
    (owner) => owner.valueKind === 'asset' || owner.valueKind === 'asset[]',
  ).map((owner) => owner.key),
);

const ASSET_ROLE_ORDER: readonly BrandKitAssetRole[] = [
  'logo',
  'banner',
  'reference',
];

const ASSET_ROLE_LABELS: Record<BrandKitAssetRole, string> = {
  banner: 'Banner',
  logo: 'Logo',
  reference: 'References',
};

const ASSET_IMPORT_STATUS_LABELS: Record<BrandKitAssetImportStatus, string> = {
  failed: 'Import failed',
  imported: 'Imported',
  skipped: 'Skipped',
};

const STRING_LIST_FIELDS = new Set<BrandKitFieldKey>([
  'strategyContentTypes',
  'strategyGoals',
  'strategyPlatforms',
  'voiceAudience',
  'voiceDoNotSoundLike',
  'voiceMessagingPillars',
  'voiceValues',
]);

type BrandKitFieldValues = Partial<Record<BrandKitFieldKey, string>>;

type BrandKitGroupedField = {
  field: IBrandKitDraftField;
  key: BrandKitFieldKey;
};

function hasObjectValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function formatBrandKitObject(value: Record<string, unknown>): string {
  const label = typeof value.label === 'string' ? value.label : '';
  const url = typeof value.url === 'string' ? value.url : '';
  const platform = typeof value.platform === 'string' ? value.platform : '';
  const role = typeof value.role === 'string' ? value.role : '';
  const dimensions =
    typeof value.width === 'number' && typeof value.height === 'number'
      ? `${value.width}x${value.height}`
      : '';

  return [label, platform, role, dimensions, url].filter(Boolean).join(' ');
}

function formatBrandKitValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) =>
        hasObjectValue(entry) ? formatBrandKitObject(entry) : String(entry),
      )
      .filter(Boolean)
      .join('\n');
  }

  if (hasObjectValue(value)) {
    return formatBrandKitObject(value);
  }

  return String(value);
}

function isAssetValue(value: unknown): value is IBrandKitAssetValue {
  return hasObjectValue(value) && typeof value.role === 'string';
}

function toAssetValues(value: unknown): IBrandKitAssetValue[] {
  if (Array.isArray(value)) {
    return value.filter(isAssetValue);
  }

  return isAssetValue(value) ? [value] : [];
}

function parseEditableValue(key: BrandKitFieldKey, value: string) {
  if (!STRING_LIST_FIELDS.has(key)) {
    return value.trim();
  }

  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSocialUrls(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasProposedValue(field: IBrandKitDraftField): boolean {
  return field.proposedValue !== undefined && field.proposedValue !== null;
}

function canApplyField(key: BrandKitFieldKey, field: IBrandKitDraftField) {
  return hasProposedValue(field) && !DEFERRED_REVIEW_FIELDS.has(key);
}

function getDiagnostics(
  draft: IBrandKitDraft | null,
  applyResult: IBrandKitApplyResult | null,
  assetImportResult: IBrandKitAssetImportResponse | null,
): IBrandKitDiagnostic[] {
  return [
    ...(draft?.diagnostics ?? []),
    ...(draft?.readiness.diagnostics ?? []),
    ...(applyResult?.diagnostics ?? []),
    ...(assetImportResult?.diagnostics ?? []),
  ];
}

export default function BrandKitReviewCard({
  brand,
  brandId,
  onRefreshBrand,
}: BrandKitReviewCardProps) {
  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [socialUrls, setSocialUrls] = useState('');
  const [draft, setDraft] = useState<IBrandKitDraft | null>(null);
  const [fieldValues, setFieldValues] = useState<BrandKitFieldValues>({});
  const [selectedFields, setSelectedFields] = useState<Set<BrandKitFieldKey>>(
    new Set(),
  );
  const [applyResult, setApplyResult] = useState<IBrandKitApplyResult | null>(
    null,
  );
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(
    new Set(),
  );
  const [shouldReplaceExisting, setShouldReplaceExisting] = useState(false);
  const [assetImportResult, setAssetImportResult] =
    useState<IBrandKitAssetImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isImportingAssets, setIsImportingAssets] = useState(false);

  const groupedFields = useMemo(() => {
    const groups = new Map<BrandKitFieldGroup, BrandKitGroupedField[]>();

    for (const group of FIELD_GROUP_ORDER) {
      groups.set(group, []);
    }

    if (!draft) {
      return groups;
    }

    for (const owner of BRAND_KIT_FIELD_OWNERSHIP) {
      const field = draft.fields[owner.key];

      if (field) {
        groups.get(owner.group)?.push({ field, key: owner.key });
      }
    }

    return groups;
  }, [draft]);

  const diagnostics = useMemo(
    () => getDiagnostics(draft, applyResult, assetImportResult),
    [applyResult, assetImportResult, draft],
  );

  const candidatesByRole = useMemo(() => {
    const groups = new Map<BrandKitAssetRole, IBrandKitAssetCandidate[]>();

    for (const candidate of draft?.assetCandidates ?? []) {
      const group = groups.get(candidate.role) ?? [];
      group.push(candidate);
      groups.set(candidate.role, group);
    }

    return groups;
  }, [draft]);

  const importStatusByCandidateId = useMemo(() => {
    const statuses = new Map<string, BrandKitAssetImportStatus>();

    for (const result of assetImportResult?.results ?? []) {
      if (result.candidateId) {
        statuses.set(result.candidateId, result.status);
      }
    }

    return statuses;
  }, [assetImportResult]);

  const selectedApplyCount = useMemo(() => {
    if (!draft) {
      return 0;
    }

    return Array.from(selectedFields).filter((key) => {
      const field = draft.fields[key];
      return field ? canApplyField(key, field) : false;
    }).length;
  }, [draft, selectedFields]);

  const initializeDraftReview = useCallback((nextDraft: IBrandKitDraft) => {
    const nextValues: BrandKitFieldValues = {};
    const nextSelected = new Set<BrandKitFieldKey>();

    for (const owner of BRAND_KIT_FIELD_OWNERSHIP) {
      const field = nextDraft.fields[owner.key];

      if (!field) {
        continue;
      }

      nextValues[owner.key] = formatBrandKitValue(
        field.proposedValue ?? field.currentValue,
      );

      if (canApplyField(owner.key, field)) {
        nextSelected.add(owner.key);
      }
    }

    setFieldValues(nextValues);
    setSelectedFields(nextSelected);
    setSelectedCandidateIds(new Set());
    setAssetImportResult(null);
  }, []);

  const handleScan = useCallback(async () => {
    const url = websiteUrl.trim();

    if (!url) {
      setError('Enter a website URL before scanning.');
      return;
    }

    setIsScanning(true);
    setError(null);
    setApplyResult(null);

    try {
      const service = await getBrandsService();
      const nextDraft = await service.crawlBrandKitWebsite(brandId, {
        socialUrls: parseSocialUrls(socialUrls),
        url,
      });

      setDraft(nextDraft);
      initializeDraftReview(nextDraft);
    } catch (scanError) {
      logger.error('Failed to crawl brand kit website', scanError);
      setError('Failed to scan website for brand kit fields.');
    } finally {
      setIsScanning(false);
    }
  }, [
    brandId,
    getBrandsService,
    initializeDraftReview,
    socialUrls,
    websiteUrl,
  ]);

  const handleToggleField = useCallback(
    (key: BrandKitFieldKey, checked: boolean) => {
      setSelectedFields((current) => {
        const next = new Set(current);

        if (checked) {
          next.add(key);
        } else {
          next.delete(key);
        }

        return next;
      });
    },
    [],
  );

  const handleToggleCandidate = useCallback((candidateId: string) => {
    setSelectedCandidateIds((current) => {
      const next = new Set(current);

      if (next.has(candidateId)) {
        next.delete(candidateId);
      } else {
        next.add(candidateId);
      }

      return next;
    });
  }, []);

  const handleImportAssets = useCallback(async () => {
    if (!draft || selectedCandidateIds.size === 0) {
      setError('Select at least one asset to import.');
      return;
    }

    setIsImportingAssets(true);
    setError(null);

    try {
      const assets = draft.assetCandidates
        .filter((candidate) => selectedCandidateIds.has(candidate.candidateId))
        .map((candidate) => ({
          candidateId: candidate.candidateId,
          height: candidate.height,
          label: candidate.label,
          mimeType: candidate.mimeType,
          replaceExisting: shouldReplaceExisting,
          role: candidate.role,
          sourceType: candidate.sourceType,
          sourceUrl: candidate.sourceUrl,
          url: candidate.url,
          width: candidate.width,
        }));

      const service = await getBrandsService();
      const result = await service.importBrandKitAssets(brandId, { assets });

      setAssetImportResult(result);
      await onRefreshBrand();
    } catch (importError) {
      logger.error('Failed to import brand kit assets', importError);
      setError('Failed to import the selected brand assets.');
    } finally {
      setIsImportingAssets(false);
    }
  }, [
    brandId,
    draft,
    getBrandsService,
    onRefreshBrand,
    selectedCandidateIds,
    shouldReplaceExisting,
  ]);

  const handleFieldValueChange = useCallback(
    (key: BrandKitFieldKey, value: string) => {
      setFieldValues((current) => ({
        ...current,
        [key]: value,
      }));
    },
    [],
  );

  const handleApply = useCallback(async () => {
    if (!draft || selectedApplyCount === 0) {
      setError('Select at least one supported field to apply.');
      return;
    }

    setIsApplying(true);
    setError(null);

    try {
      const fields = Array.from(selectedFields).reduce<
        NonNullable<
          Parameters<BrandsService['applyBrandKitDraft']>[1]
        >['fields']
      >((acc, key) => {
        const field = draft.fields[key];

        if (field && canApplyField(key, field)) {
          acc[key] = {
            action: 'accept',
            value: parseEditableValue(key, fieldValues[key] ?? ''),
          };
        }

        return acc;
      }, {});

      const service = await getBrandsService();
      const result = await service.applyBrandKitDraft(brandId, {
        draftId: draft.id,
        fields,
      });

      setApplyResult(result);
      await onRefreshBrand();
    } catch (applyError) {
      logger.error('Failed to apply brand kit draft', applyError);
      setError('Failed to apply selected brand kit fields.');
    } finally {
      setIsApplying(false);
    }
  }, [
    brandId,
    draft,
    fieldValues,
    getBrandsService,
    onRefreshBrand,
    selectedApplyCount,
    selectedFields,
  ]);

  return (
    <Card
      data-testid="brand-kit-review-card"
      label="Brand Kit Review"
      description="Scan the brand site and apply proposed profile fields."
      bodyClassName="gap-3 p-4"
    >
      <div className="space-y-3">
        <div className="flex min-w-0 items-center gap-1 rounded-lg bg-background-tertiary p-1 shadow-border">
          <Input
            aria-label="Website URL"
            className={INLINE_INPUT_CLASSNAME}
            placeholder="https://example.com"
            value={websiteUrl}
            onChange={(event) => setWebsiteUrl(event.target.value)}
          />
          <Button
            className="h-8 shrink-0 px-3 text-xs"
            isDisabled={!websiteUrl.trim()}
            isLoading={isScanning}
            label={draft ? 'Rescan' : 'Scan'}
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
            onClick={() => void handleScan()}
          />
        </div>

        <Input
          aria-label="Social URLs"
          className="h-8 border-0 bg-background-tertiary text-sm text-foreground shadow-border placeholder:text-muted-foreground/80 focus-visible:border-0"
          placeholder="Social URLs (optional, comma-separated)"
          value={socialUrls}
          onChange={(event) => setSocialUrls(event.target.value)}
        />

        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {draft ? (
          <div className="rounded-md bg-background-secondary px-3 py-2 text-sm shadow-border">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {draft.readiness.score}% readiness
              </span>
              <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
                {draft.readiness.status}
              </span>
            </div>
            {draft.readiness.missingFields.length > 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Missing: {draft.readiness.missingFields.join(', ')}
              </p>
            ) : null}
          </div>
        ) : null}

        {draft ? (
          <div className="space-y-5">
            {FIELD_GROUP_ORDER.map((group) => {
              const fields = groupedFields.get(group) ?? [];

              if (fields.length === 0) {
                return null;
              }

              return (
                <section key={group} className="space-y-3">
                  <h3 className="text-sm font-semibold">
                    {FIELD_GROUP_LABELS[group]}
                  </h3>

                  <div className="space-y-3">
                    {fields.map(({ field, key }) => {
                      const isDeferred = DEFERRED_REVIEW_FIELDS.has(key);
                      const isAssetField = ASSET_FIELDS.has(key);
                      const isSelectable = canApplyField(key, field);
                      const proposedValue = formatBrandKitValue(
                        field.proposedValue,
                      );
                      const currentValue = formatBrandKitValue(
                        field.currentValue,
                      );
                      const proposedAssets = isAssetField
                        ? toAssetValues(field.proposedValue)
                        : [];
                      const currentAssets = isAssetField
                        ? toAssetValues(field.currentValue)
                        : [];

                      return (
                        <div
                          key={key}
                          className="rounded-md bg-background-secondary p-3 shadow-border"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="font-medium">{field.label}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                Confidence:{' '}
                                {field.confidence
                                  ? `${Math.round(field.confidence * 100)}%`
                                  : 'not scored'}
                              </div>
                            </div>

                            {isSelectable ? (
                              <Checkbox
                                aria-label={`Apply ${field.label}`}
                                isChecked={selectedFields.has(key)}
                                label="Apply"
                                onCheckedChange={(checked) =>
                                  handleToggleField(key, checked === true)
                                }
                              />
                            ) : (
                              <span className="rounded-full bg-background-secondary px-2 py-1 text-xs text-muted-foreground">
                                {isAssetField
                                  ? 'Pick images below'
                                  : isDeferred
                                    ? 'Safe import pending'
                                    : 'Review only'}
                              </span>
                            )}
                          </div>

                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <div>
                              <div className="mb-1 text-xs font-medium text-muted-foreground">
                                Current
                              </div>
                              {isAssetField ? (
                                <BrandKitAssetGrid
                                  assets={currentAssets}
                                  emptyLabel="Empty"
                                />
                              ) : (
                                <pre className="min-h-12 whitespace-pre-wrap rounded-md bg-background-secondary p-2 text-xs">
                                  {currentValue || 'Empty'}
                                </pre>
                              )}
                            </div>

                            <div>
                              <div className="mb-1 text-xs font-medium text-muted-foreground">
                                Proposed
                              </div>
                              {isAssetField ? (
                                <BrandKitAssetGrid
                                  assets={proposedAssets}
                                  emptyLabel="No proposal"
                                />
                              ) : isSelectable && selectedFields.has(key) ? (
                                <Textarea
                                  aria-label={`${field.label} proposed value`}
                                  className="min-h-[72px]"
                                  value={fieldValues[key] ?? proposedValue}
                                  onChange={(event) =>
                                    handleFieldValueChange(
                                      key,
                                      event.target.value,
                                    )
                                  }
                                />
                              ) : (
                                <pre className="min-h-12 whitespace-pre-wrap rounded-md bg-background-secondary p-2 text-xs">
                                  {proposedValue || 'No proposal'}
                                </pre>
                              )}
                            </div>
                          </div>

                          {field.diagnostics.length > 0 ? (
                            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                              {field.diagnostics.map((diagnostic) => (
                                <li key={`${key}-${diagnostic.code}`}>
                                  {diagnostic.message}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            {draft.assetCandidates.length > 0 ? (
              <section className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">Asset Candidates</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Click an image to select it for import.
                    </p>
                  </div>
                  <Checkbox
                    aria-label="Replace existing logo and banner"
                    isChecked={shouldReplaceExisting}
                    label="Replace existing logo/banner"
                    onCheckedChange={(checked) =>
                      setShouldReplaceExisting(checked === true)
                    }
                  />
                </div>

                {ASSET_ROLE_ORDER.map((role) => {
                  const candidates = candidatesByRole.get(role) ?? [];

                  if (candidates.length === 0) {
                    return null;
                  }

                  return (
                    <div key={role} className="space-y-2">
                      <h4 className="text-xs font-medium text-muted-foreground">
                        {ASSET_ROLE_LABELS[role]}
                      </h4>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                        {candidates.map((candidate) => {
                          const importStatus = importStatusByCandidateId.get(
                            candidate.candidateId,
                          );

                          return (
                            <BrandKitAssetTile
                              key={candidate.candidateId}
                              asset={candidate}
                              isSelectable
                              isSelected={selectedCandidateIds.has(
                                candidate.candidateId,
                              )}
                              sourceUrl={candidate.sourceUrl}
                              statusLabel={
                                importStatus
                                  ? ASSET_IMPORT_STATUS_LABELS[importStatus]
                                  : undefined
                              }
                              onToggle={() =>
                                handleToggleCandidate(candidate.candidateId)
                              }
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {selectedCandidateIds.size} assets selected.
                  </p>
                  <Button
                    isDisabled={selectedCandidateIds.size === 0}
                    isLoading={isImportingAssets}
                    label="Import Selected Assets"
                    size={ButtonSize.SM}
                    variant={ButtonVariant.SECONDARY}
                    onClick={() => void handleImportAssets()}
                  />
                </div>

                {assetImportResult ? (
                  <div className="rounded-md bg-background-secondary px-3 py-2 text-sm shadow-border">
                    {`Imported ${assetImportResult.importedAssetIds.length} assets; skipped ${assetImportResult.skippedCandidateIds.length}; failed ${assetImportResult.failedCandidateIds.length}. Status: ${assetImportResult.status}.`}
                  </div>
                ) : null}
              </section>
            ) : null}

            {diagnostics.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Diagnostics</h3>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {diagnostics.map((diagnostic) => (
                    <li key={`${diagnostic.code}-${diagnostic.fieldKey ?? ''}`}>
                      {diagnostic.message}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {applyResult ? (
              <div className="rounded-md bg-background-secondary px-3 py-2 text-sm shadow-border">
                Applied {applyResult.appliedFields.length} fields; preserved{' '}
                {applyResult.preservedFields.length}. Status:{' '}
                {applyResult.status}.
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                {selectedApplyCount} supported fields selected. Images are
                imported from the asset picker above; social links are review
                only.
              </p>
              <Button
                isDisabled={selectedApplyCount === 0}
                isLoading={isApplying}
                label="Apply Selected Fields"
                onClick={() => void handleApply()}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-1 rounded-md border border-dashed border-border/60 px-3 py-4">
            <p className="text-sm font-medium text-foreground/70">
              No brand kit draft yet
            </p>
            <p className="text-xs leading-5 text-foreground/45">
              Enter a website URL and scan to load proposed fields for{' '}
              {brand.label}.
            </p>
          </div>
        )}

        <Button
          className="h-8 text-xs"
          label="Refresh brand"
          variant={ButtonVariant.GHOST}
          onClick={() => void onRefreshBrand()}
        />
      </div>
    </Card>
  );
}
