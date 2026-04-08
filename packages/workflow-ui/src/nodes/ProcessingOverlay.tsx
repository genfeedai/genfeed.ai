'use client';

import { Loader2, Square } from 'lucide-react';
import { memo } from 'react';
import { Button } from '../ui/button';

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
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-xs text-white/80">{label}</span>
        {onStop && (
          <Button variant="destructive" size="sm" onClick={onStop}>
            <Square className="h-3 w-3 fill-current" />
            Stop
          </Button>
        )}
      </div>
    </div>
  );
}

export const ProcessingOverlay = memo(ProcessingOverlayComponent);
