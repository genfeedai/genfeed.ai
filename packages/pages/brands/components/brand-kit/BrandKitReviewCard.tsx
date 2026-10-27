'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  BRAND_KIT_FIELD_OWNERSHIP,
  type BrandKitAssetImportStatus,
  type BrandKitAssetRole,
  type BrandKitFieldGroup,
  type IBrandKitAssetCandidate,
} from '@genfeedai/contracts/interfaces';
import type { BrandKitReviewCardProps } from '@props/pages/brand-detail.props';
import type { BrandKitGroupedField } from '@props/pages/brand-kit-review.props';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import { Input } from '@ui/primitives/input';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';
import {
  BrandKitReviewApplyControls,
  useBrandKitReviewApplySetter,
} from './BrandKitReviewApplyBar';
import BrandKitReviewAssets from './BrandKitReviewAssets';
import SourceEvidenceRows, { EvidenceLabel } from './BrandKitReviewEvidence';
import BrandKitReviewFields from './BrandKitReviewFields';
import {
  ASSET_IMPORT_STATUS_LABELS,
  BRAND_KIT_REVIEW_COPY,
  canApplyField,
  FIELD_GROUP_ORDER,
  formatAppliedFieldsSummary,
  formatDraftPrompt,
  formatMissingFields,
  formatReadinessScore,
  formatSelectedFieldSummary,
  getDiagnostics,
  hasProposedValue,
  INLINE_INPUT_CLASSNAME,
} from './brand-kit-review.helpers';
import { useBrandKitReviewCard } from './useBrandKitReviewCard';

export default function BrandKitReviewCard(props: BrandKitReviewCardProps) {
  const { brand } = props;
  const translate = useTranslations('pages.brandKitReview');
  const {
    websiteUrl,
    setWebsiteUrl,
    socialUrls,
    setSocialUrls,
    draft,
    fieldValues,
    selectedFields,
    applyResult,
    selectedCandidateIds,
    shouldReplaceExisting,
    setShouldReplaceExisting,
    assetImportResult,
    error,
    isScanning,
    isApplying,
    isImportingAssets,
    handleScan,
    handleToggleField,
    handleToggleCandidate,
    handleImportAssets,
    handleFieldValueChange,
    handleApplyKeys,
    isBrandOsDraft,
  } = useBrandKitReviewCard(props);
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

      if (field && hasProposedValue(field)) {
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

  const statusLabelByCandidateId = useMemo(() => {
    const labels = new Map<string, string>();

    for (const [candidateId, status] of importStatusByCandidateId) {
      labels.set(candidateId, ASSET_IMPORT_STATUS_LABELS[status]);
    }

    return labels;
  }, [importStatusByCandidateId]);

  const selectedApplyCount = useMemo(() => {
    if (!draft) {
      return 0;
    }

    return Array.from(selectedFields).filter((key) => {
      const field = draft.fields[key];
      return field ? canApplyField(key, field) : false;
    }).length;
  }, [draft, selectedFields]);

  const setApplyState = useBrandKitReviewApplySetter();
  const applySummary = formatSelectedFieldSummary(selectedApplyCount);
  const isApplyDisabled = selectedApplyCount === 0 || isApplying;

  useEffect(() => {
    if (!setApplyState) {
      return;
    }

    if (!draft) {
      setApplyState(null);
      return;
    }

    setApplyState({
      isApplying,
      isDisabled: isApplyDisabled,
      onApply: () => {
        void handleApplyKeys([...selectedFields]);
      },
      summary: applySummary,
    });
  }, [
    applySummary,
    draft,
    handleApplyKeys,
    isApplyDisabled,
    isApplying,
    selectedFields,
    setApplyState,
  ]);

  useEffect(() => {
    if (!setApplyState) {
      return;
    }

    return () => {
      setApplyState(null);
    };
  }, [setApplyState]);

  return (
    <Card
      data-brand-os-state={
        isBrandOsDraft
          ? applyResult?.appliedFields.length
            ? 'accepted'
            : 'saved'
          : undefined
      }
      data-testid="brand-kit-review-card"
      label={translate('title')}
      bodyClassName="gap-3 p-4"
    >
      <div
        aria-busy={isScanning || isApplying || isImportingAssets}
        className="space-y-3"
        data-scale-role="product"
      >
        <div className="flex min-w-0 items-center gap-1 rounded-lg bg-background-tertiary p-1 shadow-border">
          <Input
            aria-label={translate('websiteUrl')}
            className={INLINE_INPUT_CLASSNAME}
            placeholder={translate('websiteUrlPlaceholder')}
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
          aria-label={translate('socialUrls')}
          className="h-8 border-0 bg-background-tertiary text-sm text-foreground shadow-border placeholder:text-muted-foreground/80 focus-visible:border-0"
          placeholder={translate('socialUrlsPlaceholder')}
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
              <Badge variant="secondary">{draft.readiness.status}</Badge>
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
          <Collapsible>
            <CollapsibleTrigger className="py-0 text-left hover:no-underline">
              <h3
                className="text-sm font-semibold"
                id="brand-kit-source-evidence"
              >
                {translate('sourceEvidence')}
              </h3>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SourceEvidenceRows evidence={draft.evidence} />
            </CollapsibleContent>
          </Collapsible>
        ) : null}

        {draft ? (
          <div className="space-y-5">
            {setApplyState ? null : (
              <BrandKitReviewApplyControls
                state={{
                  isApplying,
                  isDisabled: isApplyDisabled,
                  onApply: () => {
                    void handleApplyKeys([...selectedFields]);
                  },
                  summary: applySummary,
                }}
              />
            )}
            <BrandKitReviewFields
              draft={draft}
              groupedFields={groupedFields}
              fieldValues={fieldValues}
              selectedFields={selectedFields}
              selectedCandidateIds={selectedCandidateIds}
              statusLabelByCandidateId={statusLabelByCandidateId}
              isApplying={isApplying}
              isImportingAssets={isImportingAssets}
              handleToggleField={handleToggleField}
              handleApplyKeys={handleApplyKeys}
              handleImportAssets={handleImportAssets}
              handleToggleCandidate={handleToggleCandidate}
              handleFieldValueChange={handleFieldValueChange}
            />
            <BrandKitReviewAssets
              draft={draft}
              candidatesByRole={candidatesByRole}
              importStatusByCandidateId={importStatusByCandidateId}
              selectedCandidateIds={selectedCandidateIds}
              shouldReplaceExisting={shouldReplaceExisting}
              setShouldReplaceExisting={setShouldReplaceExisting}
              isImportingAssets={isImportingAssets}
              handleToggleCandidate={handleToggleCandidate}
              handleImportAssets={handleImportAssets}
              assetImportResult={assetImportResult}
            />
            {diagnostics.length > 0 ? (
              <Collapsible>
                <CollapsibleTrigger className="py-0 text-left hover:no-underline">
                  <span className="text-sm font-semibold">
                    {BRAND_KIT_REVIEW_COPY.diagnostics}
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {diagnostics.map((diagnostic) => (
                      <li
                        key={`${diagnostic.code}-${diagnostic.fieldKey ?? ''}`}
                      >
                        <span className="font-medium capitalize text-foreground/70">
                          {diagnostic.severity}:
                        </span>{' '}
                        {diagnostic.message}
                      </li>
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
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
          </div>
        ) : (
          <div className="flex flex-col items-start gap-1 rounded-md border border-dashed border-border/60 px-3 py-4">
            <p className="text-sm font-medium text-foreground/70">
              {BRAND_KIT_REVIEW_COPY.noDraft}
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              {formatDraftPrompt(brand.label)}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
