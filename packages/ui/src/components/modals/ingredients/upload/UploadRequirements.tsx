'use client';

import { Badge } from '@ui/primitives/badge';
import { useTranslations } from 'next-intl';

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
  const translate = useTranslations('ui.uploadModal');

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex flex-wrap justify-center gap-1.5">
        <Badge variant="secondary">
          {maxFiles === 1
            ? translate('singleFile')
            : translate('upToFiles', { count: maxFiles })}
        </Badge>

        <Badge variant="secondary">
          {translate('maxSizeEach', { size: maxSize })}
        </Badge>

        {acceptedTypes.length > 0 ? (
          <Badge variant="secondary">
            {acceptedTypes
              .map((extension) => extension.replace('.', '').toUpperCase())
              .join(' · ')}
          </Badge>
        ) : null}
      </div>
      {dimensionWarning ? (
        <p className="text-xs text-warning">{dimensionWarning}</p>
      ) : dimensionText ? (
        <p className="text-xs text-muted-foreground">{dimensionText}</p>
      ) : null}
    </div>
  );
}
