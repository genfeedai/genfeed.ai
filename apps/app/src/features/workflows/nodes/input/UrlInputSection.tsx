'use client';

import { useState } from 'react';
import { NodeButton } from '@/features/workflows/components/ui/button';
import { NodeInput } from '@/features/workflows/components/ui/inputs';
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
      <NodeInput
        aria-label="Video URL"
        label="Video URL"
        placeholder="https://..."
        value={urlValue}
        onChange={(event) => setUrlValue(event.target.value)}
      />
      <div className="flex gap-2">
        <NodeButton
          fullWidth
          onClick={() => {
            const trimmedUrl = urlValue.trim();
            if (trimmedUrl.length > 0) {
              onLoadUrl(trimmedUrl);
            }
          }}
          disabled={urlValue.trim().length === 0}
        >
          Load URL
        </NodeButton>
        {mediaConfig.resolvedUrl && (
          <NodeButton variant="ghost" onClick={onClear}>
            Clear
          </NodeButton>
        )}
      </div>
    </div>
  );
}
