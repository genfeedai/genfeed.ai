'use client';

import { ButtonVariant } from '@genfeedai/enums';
import {
  BRAND_KIT_FIELD_OWNERSHIP,
  type BrandKitFieldGroup,
  type BrandKitFieldKey,
  type IBrandKitApplyResult,
  type IBrandKitAssetCandidate,
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
): IBrandKitDiagnostic[] {
  return [
    ...(draft?.diagnostics ?? []),
    ...(draft?.readiness.diagnostics ?? []),
    ...(applyResult?.diagnostics ?? []),
  ];
}

function getAssetCandidateSummary(candidate: IBrandKitAssetCandidate): string {
  return [
    candidate.candidateId,
    candidate.role,
    candidate.label,
    candidate.width && candidate.height
      ? `${candidate.width}x${candidate.height}`
      : '',
    candidate.sourceUrl ?? candidate.url,
  ]
    .filter(Boolean)
    .join(' ');
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
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

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
    () => getDiagnostics(draft, applyResult),
    [applyResult, draft],
  );

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
      className="p-6"
      data-testid="brand-kit-review-card"
      label="Brand Kit Review"
      description="Scan the brand website, compare proposed fields, and apply selected profile guidance."
    >
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <Input
            label="Website URL"
            placeholder="https://example.com"
            value={websiteUrl}
            onChange={(event) => setWebsiteUrl(event.target.value)}
          />

          <Button
            className="w-full md:w-auto"
            isDisabled={!websiteUrl.trim()}
            isLoading={isScanning}
            label={draft ? 'Rescan' : 'Scan Website'}
            onClick={() => void handleScan()}
          />
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium"
            htmlFor="brand-kit-social-urls"
          >
            Social URLs
          </label>
          <Textarea
            id="brand-kit-social-urls"
            className="min-h-[72px]"
            placeholder="https://linkedin.com/company/example"
            value={socialUrls}
            onChange={(event) => setSocialUrls(event.target.value)}
          />
        </div>

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
                      const isSelectable = canApplyField(key, field);
                      const proposedValue = formatBrandKitValue(
                        field.proposedValue,
                      );
                      const currentValue = formatBrandKitValue(
                        field.currentValue,
                      );

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
                                {isDeferred
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
                              <pre className="min-h-12 whitespace-pre-wrap rounded-md bg-background-secondary p-2 text-xs">
                                {currentValue || 'Empty'}
                              </pre>
                            </div>

                            <div>
                              <div className="mb-1 text-xs font-medium text-muted-foreground">
                                Proposed
                              </div>
                              {isSelectable && selectedFields.has(key) ? (
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
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Asset Candidates</h3>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {draft.assetCandidates.map((candidate) => (
                    <li key={candidate.candidateId}>
                      {getAssetCandidateSummary(candidate)}
                    </li>
                  ))}
                </ul>
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
                {selectedApplyCount} supported fields selected. Assets and
                social links are reviewed here and preserved for the safe import
                flow.
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
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            No brand kit draft loaded for {brand.label}.
          </div>
        )}

        <Button
          label="Refresh Brand"
          variant={ButtonVariant.SECONDARY}
          onClick={() => void onRefreshBrand()}
        />
      </div>
    </Card>
  );
}
