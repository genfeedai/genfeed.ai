import {
  BRAND_KIT_FIELD_OWNERSHIP,
  type BrandKitFieldKey,
  type IBrandKitApplyResult,
  type IBrandKitAssetImportResponse,
  type IBrandKitDraft,
  type IBrandOsDraftHandoff,
} from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { BrandKitReviewCardProps } from '@props/pages/brand-detail.props';
import { logger } from '@services/core/logger.service';
import { BrandsService } from '@services/social/brands.service';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BrandKitFieldValues } from '@/features/brands/props/brand-kit-review.props';
import {
  canApplyField,
  formatBrandKitValue,
  hasProposedValue,
  nextAppliedField,
  parseSocialUrls,
  readApplyValue,
} from './brand-kit-review.helpers';

/** The claimed draft read the review was last seeded from, per brand. */
interface ClaimedDraftSeed {
  brandId: string;
  /** Undefined until the read has landed. */
  handoff: IBrandOsDraftHandoff | null | undefined;
}

function claimedBrandOsDraftQueryKey(brandId: string) {
  return ['brand-os-claimed-draft', brandId] as const;
}

function createBrandsService(token: string): BrandsService {
  return BrandsService.getInstance(token);
}

export function useBrandKitReviewCard({
  onDraftCreated,
  brandId,
  loadClaimedBrandOsDraft = false,
  onBrandOsDraftAccepted,
  onBrandOsDraftLoaded,
  onRefreshBrand,
}: Omit<BrandKitReviewCardProps, 'brand'>) {
  const brandOsTranslate = useTranslations('pages.brandOsSettings');
  const queryClient = useQueryClient();
  const getBrandsService = useAuthedService(createBrandsService);
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
  // The claimed Brand OS draft the review was seeded from, if it was.
  const [appliedHandoff, setAppliedHandoff] =
    useState<IBrandOsDraftHandoff | null>(null);
  const [hasReviewEdits, setHasReviewEdits] = useState(false);

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

  // The claimed Brand OS draft reads through React Query, so coming back to
  // Brand Kit paints it at once and refreshes it in the background.
  const claimedQuery = useAuthedQuery<
    BrandsService,
    IBrandOsDraftHandoff | null
  >({
    enabled: loadClaimedBrandOsDraft && Boolean(brandId),
    queryFn: (service) => service.getClaimedBrandOsDraft(brandId),
    queryKey: claimedBrandOsDraftQueryKey(brandId),
    service: createBrandsService,
  });
  const claimedHandoff = loadClaimedBrandOsDraft
    ? claimedQuery.data
    : undefined;
  const { error: claimedError } = claimedQuery;
  const hasClaimedHandoff = claimedHandoff !== undefined;

  // What the review was last seeded from. A fresh read re-seeds it only while
  // the user has not scanned, edited or applied anything; another brand
  // always starts over.
  const [seedSource, setSeedSource] = useState<ClaimedDraftSeed>({
    brandId,
    handoff: undefined,
  });
  if (seedSource.brandId !== brandId || seedSource.handoff !== claimedHandoff) {
    const isOtherBrand = seedSource.brandId !== brandId;
    setSeedSource({ brandId, handoff: claimedHandoff });
    if (isOtherBrand) {
      setHasReviewEdits(false);
    }
    if (claimedHandoff !== undefined && (isOtherBrand || !hasReviewEdits)) {
      // A handoff without a draft cannot seed the review; treat it as none.
      if (claimedHandoff?.draft) {
        setAppliedHandoff(claimedHandoff);
        setDraft(claimedHandoff.draft);
        initializeDraftReview(claimedHandoff.draft);
      } else if (appliedHandoff) {
        setAppliedHandoff(null);
        setDraft(null);
        setFieldValues({});
        setSelectedFields(new Set());
        setSelectedCandidateIds(new Set());
        setAssetImportResult(null);
      }
    }
  }

  // Report each claimed draft the review shows once.
  const reportedHandoffRef = useRef<IBrandOsDraftHandoff | null>(null);
  useEffect(() => {
    if (!appliedHandoff || reportedHandoffRef.current === appliedHandoff) {
      return;
    }
    reportedHandoffRef.current = appliedHandoff;
    onBrandOsDraftLoaded?.();
  }, [appliedHandoff, onBrandOsDraftLoaded]);

  useEffect(() => {
    if (claimedError && !hasClaimedHandoff) {
      logger.error('Failed to read claimed Brand OS draft', claimedError);
    }
  }, [claimedError, hasClaimedHandoff]);

  const handleScan = useCallback(async () => {
    const url = websiteUrl.trim();

    if (!url) {
      setError('Enter a website URL before scanning.');
      return;
    }

    setIsScanning(true);
    setError(null);
    setApplyResult(null);
    setHasReviewEdits(true);
    setAppliedHandoff(null);

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
      setHasReviewEdits(true);
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
    setHasReviewEdits(true);
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
      setHasReviewEdits(true);
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
      // From here the review is the user's: a background refresh landing while
      // the apply is in flight must not re-seed the draft being applied.
      setHasReviewEdits(true);

      try {
        const service = await getBrandsService();
        const result = await service.applyBrandKitDraft(brandId, {
          draftId: draft.id,
          fields,
        });

        setApplyResult(result);
        setHasReviewEdits(true);
        if (appliedHandoff && result.appliedFields.length > 0) {
          onBrandOsDraftAccepted?.();
          // Accepting changes the claimed draft; the next visit reads it anew.
          void queryClient.invalidateQueries({
            queryKey: claimedBrandOsDraftQueryKey(brandId),
          });
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
      appliedHandoff,
      brandId,
      draft,
      fieldValues,
      getBrandsService,
      onBrandOsDraftAccepted,
      onDraftCreated,
      onRefreshBrand,
      queryClient,
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
    isBrandOsDraft: appliedHandoff !== null,
  };
}
