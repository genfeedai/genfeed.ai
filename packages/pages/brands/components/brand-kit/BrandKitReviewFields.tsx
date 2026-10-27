import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { BrandKitReviewFieldsProps } from '@props/pages/brand-kit-review.props';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import { useTranslations } from 'next-intl';
import BrandKitAssetGrid from './BrandKitAssetGrid';
import SourceEvidenceRows, { EvidenceLabel } from './BrandKitReviewEvidence';
import ReviewProposedValue, { SocialLinkReadout } from './BrandKitReviewValues';
import {
  ASSET_FIELDS,
  BRAND_KIT_REVIEW_COPY,
  COLOR_FIELD_KEYS,
  canApplyField,
  DEFERRED_REVIEW_FIELDS,
  FIELD_GROUP_LABELS,
  FIELD_GROUP_ORDER,
  formatBrandKitValue,
  formatConfidence,
  formatSelectedAssetCount,
  getFieldEvidenceKind,
  showsScoredKind,
  toAssetValues,
} from './brand-kit-review.helpers';

export default function BrandKitReviewFields({
  draft,
  groupedFields,
  fieldValues,
  selectedFields,
  selectedCandidateIds,
  statusLabelByCandidateId,
  isApplying,
  isImportingAssets,
  handleToggleField,
  handleApplyKeys,
  handleImportAssets,
  handleToggleCandidate,
  handleFieldValueChange,
}: BrandKitReviewFieldsProps) {
  const translate = useTranslations('pages.brandKitReview');
  const brandOsTranslate = useTranslations('pages.brandOsSettings');
  return (
    <>
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
                const isSocialField = key === 'socialLinks';
                const isSelectable = canApplyField(key, field);
                const proposedValue = formatBrandKitValue(field.proposedValue);
                const currentValue = formatBrandKitValue(field.currentValue);
                const proposedAssets = isAssetField
                  ? toAssetValues(field.proposedValue)
                  : [];
                const currentAssets = isAssetField
                  ? toAssetValues(field.currentValue)
                  : [];
                const evidenceKind = getFieldEvidenceKind(key, field);
                const confidenceLabel = showsScoredKind(
                  evidenceKind,
                  field.confidence,
                )
                  ? formatConfidence(field.confidence)
                  : null;

                return (
                  <Collapsible key={key}>
                    <div className="rounded-md bg-background-secondary p-3 shadow-border">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <CollapsibleTrigger className="w-auto min-w-0 flex-none justify-start py-0 text-left hover:no-underline">
                              <span className="font-medium">{field.label}</span>
                            </CollapsibleTrigger>
                            {confidenceLabel ? (
                              <EvidenceLabel kind={evidenceKind} />
                            ) : (
                              <Badge variant="warning">
                                {brandOsTranslate('verify')}
                              </Badge>
                            )}
                          </div>
                          {confidenceLabel ? (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {confidenceLabel}
                            </div>
                          ) : null}
                        </div>

                        {isSelectable ? (
                          <div className="flex items-center gap-2">
                            <Checkbox
                              aria-label={`Select ${field.label}`}
                              isChecked={selectedFields.has(key)}
                              label={translate('select')}
                              onCheckedChange={(checked) =>
                                handleToggleField(key, checked === true)
                              }
                            />
                            <Button
                              ariaLabel={`Apply ${field.label}`}
                              isDisabled={isApplying}
                              label={translate('apply')}
                              size={ButtonSize.SM}
                              variant={ButtonVariant.SECONDARY}
                              onClick={() => void handleApplyKeys([key])}
                            />
                          </div>
                        ) : (
                          <Badge variant="secondary">
                            {isAssetField
                              ? 'Select images to import'
                              : isDeferred
                                ? 'Safe import pending'
                                : 'Review only'}
                          </Badge>
                        )}
                      </div>

                      <CollapsibleContent>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <div className="mb-1 text-xs font-medium text-muted-foreground">
                              {BRAND_KIT_REVIEW_COPY.current}
                            </div>
                            {isAssetField ? (
                              <BrandKitAssetGrid
                                assets={currentAssets}
                                emptyLabel={translate('empty')}
                              />
                            ) : isSocialField ? (
                              <SocialLinkReadout
                                emptyLabel={translate('empty')}
                                value={field.currentValue}
                              />
                            ) : (
                              <pre className="min-h-12 whitespace-pre-wrap rounded-md bg-background-secondary p-2 text-xs">
                                {currentValue || translate('empty')}
                              </pre>
                            )}
                          </div>

                          <div>
                            <div className="mb-1 text-xs font-medium text-muted-foreground">
                              {BRAND_KIT_REVIEW_COPY.proposed}
                            </div>
                            <ReviewProposedValue
                              assetCandidates={draft.assetCandidates}
                              assetImportFooter={
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-xs text-muted-foreground">
                                    {formatSelectedAssetCount(
                                      selectedCandidateIds.size,
                                    )}
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
                              }
                              editableValue={fieldValues[key] ?? proposedValue}
                              isAssetField={isAssetField}
                              isColorField={COLOR_FIELD_KEYS.has(key)}
                              isEditable={
                                isSelectable && selectedFields.has(key)
                              }
                              isSocialField={isSocialField}
                              label={field.label}
                              noProposalLabel={translate('noProposal')}
                              proposedAssets={proposedAssets}
                              proposedValue={proposedValue}
                              selectedCandidateIds={selectedCandidateIds}
                              socialValue={field.proposedValue}
                              statusLabelByCandidateId={
                                statusLabelByCandidateId
                              }
                              onToggleCandidate={handleToggleCandidate}
                              onValueChange={(value) =>
                                handleFieldValueChange(key, value)
                              }
                            />
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
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
