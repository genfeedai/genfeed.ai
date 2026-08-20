import type { ModelSelectorBrandMarkProps } from '@genfeedai/props/ui/model-selector/model-selector.props';

export default function ModelSelectorBrandMark({
  brandColor,
  brandIcon: BrandIcon,
  brandLabel,
  testId,
}: ModelSelectorBrandMarkProps) {
  return (
    <div
      className="flex size-5 shrink-0 items-center justify-center rounded border border-border"
      style={{ backgroundColor: `${brandColor}1f`, color: brandColor }}
    >
      {BrandIcon ? (
        <BrandIcon className="size-3.5" data-testid={testId} />
      ) : (
        <span className="text-2xs font-semibold leading-none">
          {brandLabel.charAt(0)}
        </span>
      )}
    </div>
  );
}
