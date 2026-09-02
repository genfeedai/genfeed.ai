'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  BRAND_KIT_ASSET_FIELD_KEYS,
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
  type IBrandKitSourceEvidence,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { BrandKitReviewCardProps } from '@props/pages/brand-detail.props';
import { logger } from '@services/core/logger.service';
import { BrandsService } from '@services/social/brands.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
const ASSET_FIELDS = new Set<BrandKitFieldKey>(BRAND_KIT_ASSET_FIELD_KEYS);

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

const BRAND_KIT_REVIEW_COPY = {
  assetCandidates: 'Asset Candidates',
  assetSelectionHint: 'Click an image to select it for import.',
  current: 'Current',
  diagnostics: 'Diagnostics',
  noDraft: 'No brand kit draft yet',
  proposed: 'Proposed',
} as const;

type EvidenceKind = 'candidate' | 'extracted' | 'inferred' | 'missing';

const COLOR_FIELD_KEYS = new Set<BrandKitFieldKey>([
  'backgroundColor',
  'primaryColor',
  'secondaryColor',
]);

const EVIDENCE_KIND_CLASSNAMES: Record<EvidenceKind, string> = {
  candidate: 'bg-warning/10 text-warning',
  extracted: 'bg-success/10 text-success',
  inferred: 'bg-info/10 text-info',
  missing: 'bg-destructive/10 text-destructive',
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

function formatAppliedFieldsSummary(result: IBrandKitApplyResult): string {
  return `Applied ${result.appliedFields.length} fields; preserved ${result.preservedFields.length}. Status: ${result.status}.`;
}

function formatConfidence(confidence: number | undefined): string {
  return `Confidence: ${confidence ? `${Math.round(confidence * 100)}%` : 'not scored'}`;
}

function getFieldEvidenceKind(
  key: BrandKitFieldKey,
  field: IBrandKitDraftField,
): EvidenceKind {
  if (!hasProposedValue(field)) {
    return 'missing';
  }

  if (COLOR_FIELD_KEYS.has(key)) {
    return 'candidate';
  }

  if (field.evidence.some((evidence) => evidence.sourceType !== 'system')) {
    return 'extracted';
  }

  return 'inferred';
}

function EvidenceLabel({ kind }: { kind: EvidenceKind }) {
  return (
    <span
      className={`inline-flex rounded-sm px-2 py-0.5 text-2xs font-black uppercase tracking-[0.12em] ${EVIDENCE_KIND_CLASSNAMES[kind]}`}
    >
      {kind}
    </span>
  );
}

function SourceEvidenceRows({
  evidence,
}: {
  evidence: readonly IBrandKitSourceEvidence[];
}) {
  if (evidence.length === 0) {
    return null;
  }

  return (
    <ul aria-label="Source evidence" className="mt-3 divide-y divide-border">
      {evidence.map((source, index) => (
        <li
          className="grid min-h-8 items-center gap-1 py-1.5 text-xs sm:grid-cols-[minmax(0,1fr)_auto]"
          key={`${source.sourceType}-${source.sourceId ?? source.url ?? index}`}
        >
          <div className="min-w-0">
            {source.url ? (
              <a
                className="block truncate rounded-sm font-medium text-foreground/80 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                href={source.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                {source.label}
              </a>
            ) : (
              <span className="font-medium text-foreground/80">
                {source.label}
              </span>
            )}
            {source.excerpt ? (
              <p className="truncate text-2xs text-muted-foreground">
                {source.excerpt}
              </p>
            ) : null}
          </div>
          <span className="font-mono text-2xs uppercase text-muted-foreground">
            {source.sourceType} · {formatConfidence(source.confidence)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function formatDraftPrompt(brandLabel: string): string {
  return `Enter a website URL and scan to load proposed fields for ${brandLabel}.`;
}

function formatMissingFields(fields: readonly string[]): string {
  return `Missing: ${fields.join(', ')}`;
}

function formatReadinessScore(score: number): string {
  return `${score}% readiness`;
}

function formatSelectedAssetCount(count: number): string {
  return `${count} ${count === 1 ? 'asset' : 'assets'} selected.`;
}

function formatSelectedFieldSummary(count: number): string {
  return `${count} supported ${count === 1 ? 'field' : 'fields'} selected. Images are imported from the asset picker above; social links are review only.`;
}

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
  loadClaimedBrandOsDraft = false,
  onBrandOsDraftAccepted,
  onBrandOsDraftLoaded,
  onRefreshBrand,
}: BrandKitReviewCardProps) {
  const translate = useTranslations('pages.brandKitReview');
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
  const claimedDraftLoadRef = useRef<string | null>(null);
  const isBrandOsDraftRef = useRef(false);

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

  useEffect(() => {
    if (!loadClaimedBrandOsDraft || claimedDraftLoadRef.current === brandId) {
      return;
    }
    claimedDraftLoadRef.current = brandId;
    void getBrandsService()
      .then((service) => service.getClaimedBrandOsDraft(brandId))
      .then((handoff) => {
        isBrandOsDraftRef.current = true;
        setDraft(handoff.draft);
        initializeDraftReview(handoff.draft);
        onBrandOsDraftLoaded?.();
      })
      .catch(() => {
        // A missing claimed draft is the normal settings-page state.
      });
  }, [
    brandId,
    getBrandsService,
    initializeDraftReview,
    loadClaimedBrandOsDraft,
    onBrandOsDraftLoaded,
  ]);

  const handleScan = useCallback(async () => {
    const url = websiteUrl.trim();

    if (!url) {
      setError('Enter a website URL before scanning.');
      return;
    }

    setIsScanning(true);
    setError(null);
    setApplyResult(null);
    isBrandOsDraftRef.current = false;

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

  const handleApplyKeys = useCallback(
    async (keys: readonly BrandKitFieldKey[]) => {
      if (!draft) {
        return;
      }

      const fields = keys.reduce<
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

      if (Object.keys(fields).length === 0) {
        setError('Select at least one supported field to apply.');
        return;
      }

      setIsApplying(true);
      setError(null);

      try {
        const service = await getBrandsService();
        const result = await service.applyBrandKitDraft(brandId, {
          draftId: draft.id,
          fields,
        });

        setApplyResult(result);
        if (isBrandOsDraftRef.current && result.appliedFields.length > 0) {
          onBrandOsDraftAccepted?.();
        }
        setDraft((current) => {
          if (!current) {
            return current;
          }

          const nextFields = { ...current.fields };

          for (const key of result.appliedFields) {
            const field = nextFields[key];
            if (!field) {
              continue;
            }

            nextFields[key] = {
              ...field,
              currentValue: parseEditableValue(
                key,
                fieldValues[key] ?? formatBrandKitValue(field.proposedValue),
              ),
              proposedValue: undefined,
            };
          }

          return { ...current, fields: nextFields };
        });
        setSelectedFields((current) => {
          const next = new Set(current);
          for (const key of result.appliedFields) {
            next.delete(key);
          }
          return next;
        });
        await onRefreshBrand();
      } catch (applyError) {
        logger.error('Failed to apply brand kit draft', applyError);
        setError('Failed to apply selected brand kit fields.');
      } finally {
        setIsApplying(false);
      }
    },
    [
      brandId,
      draft,
      fieldValues,
      getBrandsService,
      onBrandOsDraftAccepted,
      onRefreshBrand,
    ],
  );

  return (
    <Card
      data-brand-os-state={
        isBrandOsDraftRef.current
          ? applyResult?.appliedFields.length
            ? 'accepted'
            : 'saved'
          : undefined
      }
      data-testid="brand-kit-review-card"
      label="Brand Kit Review"
      description="Scan the brand site and apply proposed profile fields."
      bodyClassName="gap-3 p-4"
    >
      <div
        aria-busy={isScanning || isApplying || isImportingAssets}
        className="space-y-3"
        data-scale-role="product"
      >
        <div className="flex min-w-0 items-center gap-1 rounded-lg bg-background-tertiary p-1 shadow-border">
          <Input
            aria-label="Website URL"
            className={INLINE_INPUT_CLASSNAME}
            placeholder="https://example.com"
            value={websiteUrl}
            onChange={(event) => setWebsiteUrl(event.target.value)}
          />
          <Button
            aria-busy={isScanning}
            ariaLabel={
              isScanning ? 'Scanning brand sources' : draft ? 'Rescan' : 'Scan'
            }
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
          <div
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        {draft ? (
          <div
            aria-live="polite"
            className="rounded-md bg-background-secondary px-3 py-2 text-sm shadow-border"
            role="status"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {formatReadinessScore(draft.readiness.score)}
              </span>
              <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
                {draft.readiness.status}
              </span>
            </div>
            {draft.readiness.missingFields.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <EvidenceLabel kind="missing" />
                <p className="text-xs text-muted-foreground">
                  {formatMissingFields(draft.readiness.missingFields)}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {draft?.evidence.length ? (
          <section
            aria-labelledby="brand-kit-source-evidence"
            className="space-y-1"
          >
            <h3
              className="text-sm font-semibold"
              id="brand-kit-source-evidence"
            >
              {translate('sourceEvidence')}
            </h3>
            <SourceEvidenceRows evidence={draft.evidence} />
          </section>
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
                      const evidenceKind = getFieldEvidenceKind(key, field);

                      return (
                        <div
                          key={key}
                          className="rounded-md bg-background-secondary p-3 shadow-border"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="font-medium">{field.label}</div>
                                <EvidenceLabel kind={evidenceKind} />
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {formatConfidence(field.confidence)}
                              </div>
                              {evidenceKind === 'candidate' ? (
                                <p className="mt-1 text-2xs text-warning">
                                  {translate('candidateTokenNotice')}
                                </p>
                              ) : null}
                            </div>

                            {isSelectable ? (
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  aria-label={`Select ${field.label}`}
                                  isChecked={selectedFields.has(key)}
                                  label="Select"
                                  onCheckedChange={(checked) =>
                                    handleToggleField(key, checked === true)
                                  }
                                />
                                <Button
                                  ariaLabel={`Apply ${field.label}`}
                                  isDisabled={isApplying}
                                  label="Apply"
                                  size={ButtonSize.SM}
                                  variant={ButtonVariant.SECONDARY}
                                  onClick={() => void handleApplyKeys([key])}
                                />
                              </div>
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
                                {BRAND_KIT_REVIEW_COPY.current}
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
                                {BRAND_KIT_REVIEW_COPY.proposed}
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
                                  <span className="font-medium capitalize text-foreground/70">
                                    {diagnostic.severity}:
                                  </span>{' '}
                                  {diagnostic.message}
                                </li>
                              ))}
                            </ul>
                          ) : null}

                          <SourceEvidenceRows evidence={field.evidence} />
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
                    <h3 className="text-sm font-semibold">
                      {BRAND_KIT_REVIEW_COPY.assetCandidates}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {BRAND_KIT_REVIEW_COPY.assetSelectionHint}
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
                    {formatSelectedAssetCount(selectedCandidateIds.size)}
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
                  <div
                    aria-live="polite"
                    className="rounded-md bg-background-secondary px-3 py-2 text-sm shadow-border"
                    role="status"
                  >
                    {`Imported ${assetImportResult.importedAssetIds.length} assets; skipped ${assetImportResult.skippedCandidateIds.length}; failed ${assetImportResult.failedCandidateIds.length}. Status: ${assetImportResult.status}.`}
                  </div>
                ) : null}
              </section>
            ) : null}

            {diagnostics.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">
                  {BRAND_KIT_REVIEW_COPY.diagnostics}
                </h3>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {diagnostics.map((diagnostic) => (
                    <li key={`${diagnostic.code}-${diagnostic.fieldKey ?? ''}`}>
                      <span className="font-medium capitalize text-foreground/70">
                        {diagnostic.severity}:
                      </span>{' '}
                      {diagnostic.message}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {applyResult ? (
              <div
                aria-live="polite"
                className="rounded-md bg-background-secondary px-3 py-2 text-sm shadow-border"
                role="status"
              >
                {formatAppliedFieldsSummary(applyResult)}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                {formatSelectedFieldSummary(selectedApplyCount)}
              </p>
              <Button
                isDisabled={selectedApplyCount === 0 || isApplying}
                isLoading={isApplying}
                label="Apply Selected Fields"
                onClick={() => void handleApplyKeys([...selectedFields])}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-1 rounded-md border border-dashed border-border/60 px-3 py-4">
            <p className="text-sm font-medium text-foreground/70">
              {BRAND_KIT_REVIEW_COPY.noDraft}
            </p>
            <p className="text-xs leading-5 text-foreground/45">
              {formatDraftPrompt(brand.label)}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
