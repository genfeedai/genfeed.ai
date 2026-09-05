'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@genfeedai/ui/primitives/button';
import { LoaderCircle, Square } from 'lucide-react';
import { memo } from 'react';

interface ProcessingOverlayProps {
  /** Text to show below spinner, defaults to 'Generating...' */
  label?: string;
  /** If provided, shows a Stop button */
  onStop?: () => void;
}

function ProcessingOverlayComponent({
  label = 'Generating...',
  onStop,
}: ProcessingOverlayProps) {
  return (
    <div
      className={
        'absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm' /* design-system-allow-content-color */
      }
    >
      <div className="flex flex-col items-center gap-2">
        <LoaderCircle className="size-8 animate-spin text-primary" />
        <span
          className={
            'text-xs text-white/80' /* design-system-allow-content-color */
          }
        >
          {label}
        </span>
        {onStop && (
          <Button
            withWrapper={false}
            variant={ButtonVariant.DESTRUCTIVE}
            size={ButtonSize.SM}
            onClick={onStop}
          >
            <Square className="size-3 fill-current" />
            Stop
          </Button>
        )}
      </div>
    </div>
  );
}

export const ProcessingOverlay = memo(ProcessingOverlayComponent);
