'use client';

import Badge from '@ui/display/badge/Badge';

type Props = {
  acceptedTypes: string[];
  maxFiles: number;
  maxSize: number;
  dimensionText: string;
  dimensionWarning: string | null;
};

export default function UploadRequirements({
  acceptedTypes,
  maxFiles,
  maxSize,
  dimensionText,
  dimensionWarning,
}: Props) {
  const isVisible =
    acceptedTypes.length > 0 ||
    dimensionText ||
    maxFiles >= 1 ||
    dimensionWarning;

  if (!isVisible) {
    return null;
  }

  return (
    <div className="text-xs text-muted-foreground mt-3 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="opacity-70">Requirements</span>
        <Badge variant="ghost">
          {maxFiles === 1 ? 'Single file' : `Up to ${maxFiles} files`}
        </Badge>

        <Badge variant="ghost">≤ {maxSize}MB each</Badge>

        {acceptedTypes.length > 0 && (
          <Badge variant="ghost">
            {acceptedTypes
              .map((e) => e.replace('.', '').toUpperCase())
              .join(', ')}
          </Badge>
        )}
      </div>
      {dimensionWarning ? (
        <p className="text-warning">{dimensionWarning}</p>
      ) : (
        dimensionText && <div className="opacity-80">{dimensionText}</div>
      )}
    </div>
  );
}
