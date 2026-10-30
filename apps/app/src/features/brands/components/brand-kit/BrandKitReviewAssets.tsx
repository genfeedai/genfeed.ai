import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import { useTranslations } from 'next-intl';
import type { BrandKitReviewAssetsProps } from '@/features/brands/props/brand-kit-review.props';
import BrandKitAssetTile from './BrandKitAssetTile';
import {
  ASSET_IMPORT_STATUS_LABELS,
  ASSET_ROLE_LABELS,
  ASSET_ROLE_ORDER,
  BRAND_KIT_REVIEW_COPY,
  formatSelectedAssetCount,
} from './brand-kit-review.helpers';

export default function BrandKitReviewAssets({
  draft,
  candidatesByRole,
  importStatusByCandidateId,
  selectedCandidateIds,
  shouldReplaceExisting,
  setShouldReplaceExisting,
  isImportingAssets,
  handleToggleCandidate,
  handleImportAssets,
  assetImportResult,
}: BrandKitReviewAssetsProps) {
  const translate = useTranslations('pages.brandKitReview');
  if (draft.assetCandidates.length === 0) return null;
  return (
    <Collapsible>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <CollapsibleTrigger className="w-auto min-w-0 flex-1 justify-start py-0 text-left hover:no-underline">
          <span className="text-sm font-semibold">
            {BRAND_KIT_REVIEW_COPY.assetCandidates}
          </span>
        </CollapsibleTrigger>
        <Checkbox
          aria-label={translate('replaceExistingAria')}
          isChecked={shouldReplaceExisting}
          label={translate('replaceExisting')}
          onCheckedChange={(checked) =>
            setShouldReplaceExisting(checked === true)
          }
        />
      </div>
      <CollapsibleContent>
        <p className="text-xs text-muted-foreground">
          {BRAND_KIT_REVIEW_COPY.assetSelectionHint}
        </p>

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
      </CollapsibleContent>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {formatSelectedAssetCount(selectedCandidateIds.size)}
        </p>
        <Button
          isDisabled={selectedCandidateIds.size === 0}
          isLoading={isImportingAssets}
          label={translate('importSelectedAssets')}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          onClick={() => void handleImportAssets()}
        />
      </div>

      {assetImportResult ? (
        <div
          aria-live="polite"
          className="rounded-md bg-card px-3 py-2 text-sm shadow-border"
          role="status"
        >
          {`Imported ${assetImportResult.importedAssetIds.length} assets; skipped ${assetImportResult.skippedCandidateIds.length}; failed ${assetImportResult.failedCandidateIds.length}. Status: ${assetImportResult.status}.`}
        </div>
      ) : null}
    </Collapsible>
  );
}
