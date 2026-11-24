'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { useState } from 'react';
import type { getWorkflowMediaConfig } from '@/features/workflows/nodes/input/media-picker';

export interface UrlInputSectionProps {
  mediaConfig: ReturnType<typeof getWorkflowMediaConfig>;
  onLoadUrl: (url: string) => void;
  onClear: () => void;
}

export function UrlInputSection({
  mediaConfig,
  onLoadUrl,
  onClear,
}: UrlInputSectionProps): React.JSX.Element {
  const [urlValue, setUrlValue] = useState(mediaConfig.url ?? '');

  return (
    <div className="space-y-2">
      <Input
        aria-label="Video URL"
        label="Video URL"
        placeholder="https://..."
        value={urlValue}
        onChange={(event) => setUrlValue(event.target.value)}
      />
      <div className="flex gap-2">
        <Button
          className="w-full"
          size={ButtonSize.SM}
          textTransform="none"
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
          onClick={() => {
            const trimmedUrl = urlValue.trim();
            if (trimmedUrl.length > 0) {
              onLoadUrl(trimmedUrl);
            }
          }}
          disabled={urlValue.trim().length === 0}
        >
          Load URL
        </Button>
        {mediaConfig.resolvedUrl && (
          <Button
            size={ButtonSize.SM}
            textTransform="none"
            variant={ButtonVariant.GHOST}
            withWrapper={false}
            onClick={onClear}
          >
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
