import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import type {
  ReviewProposedValueProps,
  SocialLinkReadoutProps,
} from '@props/pages/brand-kit-review.props';
import { ColorInput } from '@ui/primitives/color-input';
import { Textarea } from '@ui/primitives/textarea';
import BrandKitAssetGrid from './BrandKitAssetGrid';
import {
  isBrandKitHexColor,
  toColorPickerValue,
} from './brand-kit-color-value';
import { readSocialProposals } from './brand-kit-review.helpers';

export default function ReviewProposedValue({
  assetCandidates,
  assetImportFooter,
  editableValue,
  isAssetField,
  isColorField,
  isEditable,
  isSocialField,
  label,
  noProposalLabel,
  onToggleCandidate,
  onValueChange,
  proposedAssets,
  proposedValue,
  selectedCandidateIds,
  socialValue,
  statusLabelByCandidateId,
}: ReviewProposedValueProps) {
  if (isAssetField) {
    return (
      <div className="space-y-2">
        <BrandKitAssetGrid
          assets={[...proposedAssets]}
          candidates={assetCandidates}
          emptyLabel={noProposalLabel}
          selectedCandidateIds={selectedCandidateIds}
          statusLabelByCandidateId={statusLabelByCandidateId}
          onToggleCandidate={onToggleCandidate}
        />
        {assetImportFooter}
      </div>
    );
  }
  if (isSocialField) {
    return (
      <SocialLinkReadout emptyLabel={noProposalLabel} value={socialValue} />
    );
  }
  if (isEditable && isColorField && isBrandKitHexColor(editableValue)) {
    return (
      <ColorInput
        aria-label={`${label} proposed value`}
        value={toColorPickerValue(editableValue)}
        onChange={(event) => onValueChange(event.target.value)}
      />
    );
  }
  if (isEditable) {
    return (
      <Textarea
        aria-label={`${label} proposed value`}
        className="min-h-[72px]"
        value={editableValue}
        onChange={(event) => onValueChange(event.target.value)}
      />
    );
  }
  return (
    <pre className="min-h-12 whitespace-pre-wrap rounded-md bg-card p-2 text-xs">
      {proposedValue || noProposalLabel}
    </pre>
  );
}

export function SocialLinkReadout({
  emptyLabel,
  value,
}: SocialLinkReadoutProps) {
  const links = readSocialProposals(value);
  if (links.length === 0) {
    return (
      <p className="min-h-12 rounded-md bg-card p-2 text-xs text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul className="min-h-12 space-y-2 rounded-md bg-card p-2">
      {links.map((link) => (
        <li
          className="flex min-w-0 items-center gap-2 text-xs"
          key={`${link.platform}-${link.url}`}
        >
          <span aria-hidden="true" className="shrink-0">
            {getPlatformIcon(link.platform, 'size-4')}
          </span>
          <a
            className="min-w-0 truncate rounded-sm text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            href={link.url}
            rel="noopener noreferrer"
            target="_blank"
          >
            {link.url}
          </a>
        </li>
      ))}
    </ul>
  );
}
