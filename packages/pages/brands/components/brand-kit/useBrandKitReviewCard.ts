import {
  BRAND_KIT_FIELD_OWNERSHIP,
  type BrandKitFieldKey,
  type IBrandKitApplyResult,
  type IBrandKitAssetImportResponse,
  type IBrandKitDraft,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { BrandKitReviewCardProps } from '@props/pages/brand-detail.props';
import type { BrandKitFieldValues } from '@props/pages/brand-kit-review.props';
import { logger } from '@services/core/logger.service';
import { BrandsService } from '@services/social/brands.service';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  canApplyField,
  formatBrandKitValue,
  hasProposedValue,
  nextAppliedField,
  parseSocialUrls,
  readApplyValue,
} from './brand-kit-review.helpers';

export function useBrandKitReviewCard({
  onDraftCreated,
  brandId,
  loadClaimedBrandOsDraft = false,
  onBrandOsDraftAccepted,
  onBrandOsDraftLoaded,
  onRefreshBrand,
}: Omit<BrandKitReviewCardProps, 'brand'>) {
  const brandOsTranslate = useTranslations('pages.brandOsSettings');
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
    const controller = new AbortController();
    let hasSettled = false;
    void getBrandsService()
      .then((service) =>
        controller.signal.aborted
          ? null
          : service.getClaimedBrandOsDraft(brandId),
      )
      .then((handoff) => {
        if (controller.signal.aborted) return;
        hasSettled = true;
        if (!handoff) return;
        isBrandOsDraftRef.current = true;
        setDraft(handoff.draft);
        initializeDraftReview(handoff.draft);
        onBrandOsDraftLoaded?.();
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        hasSettled = true;
        logger.error('Failed to read claimed Brand OS draft', error);
      });
    return () => {
      controller.abort();
      if (!hasSettled && claimedDraftLoadRef.current === brandId) {
        claimedDraftLoadRef.current = null;
      }
    };
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
      try {
        await onDraftCreated?.(nextDraft);
      } catch {
        logger.error('Failed to persist scanned Brand OS revision');
        setError(brandOsTranslate('scanPersistenceFailed'));
      }
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
    onDraftCreated,
    brandOsTranslate,
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
            value: readApplyValue(key, field, fieldValues),
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
        const nextFields = { ...draft.fields };
        const retainedSelections = new Set<BrandKitFieldKey>();

        for (const key of result.appliedFields) {
          const field = nextFields[key];
          const sentDecision = fields[key];
          const sent =
            sentDecision?.action === 'accept' ? sentDecision.value : undefined;
          if (!field || sent === undefined) {
            continue;
          }

          const nextField = nextAppliedField(key, field, sent, result);
          if (!nextField || hasProposedValue(nextField)) {
            retainedSelections.add(key);
          }
          if (nextField) {
            nextFields[key] = nextField;
          }
        }

        const nextDraft = { ...draft, fields: nextFields };
        setDraft(nextDraft);
        setSelectedFields((current) => {
          const next = new Set(current);
          for (const key of result.appliedFields) {
            if (!retainedSelections.has(key)) {
              next.delete(key);
            }
          }
          return next;
        });
        if (result.appliedFields.length > 0) {
          try {
            await onDraftCreated?.(nextDraft);
          } catch (persistError) {
            logger.error(
              'Failed to persist applied Brand OS revision',
              persistError,
            );
          }
        }
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
      onDraftCreated,
      onRefreshBrand,
    ],
  );

  return {
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
    isBrandOsDraft: isBrandOsDraftRef.current,
  };
}
