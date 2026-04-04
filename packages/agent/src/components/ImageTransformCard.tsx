import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type { ReactElement } from 'react';
import { HiArrowsPointingOut, HiPhoto, HiSparkles } from 'react-icons/hi2';

interface ImageTransformCardProps {
  action: AgentUiAction;
}

export function ImageTransformCard({
  action,
}: ImageTransformCardProps): ReactElement {
  const previewUrl = action.images?.[0];

  return (
    <div className="rounded-lg border border-border bg-background p-4 my-2">
      <div className="flex items-center gap-2 mb-3">
        <HiPhoto className="w-5 h-5 text-purple-500" />
        <h3 className="font-semibold text-sm">
          {action.title || 'Image Transform'}
        </h3>
      </div>
      {action.description && (
        <p className="text-xs text-muted-foreground mb-3">
          {action.description}
        </p>
      )}
      {previewUrl && (
        <div className="rounded overflow-hidden mb-3 bg-muted">
          <img
            src={previewUrl}
            alt="Transform preview"
            className="w-full h-auto max-h-48 object-contain"
          />
        </div>
      )}
      {action.ctas && action.ctas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {action.ctas.map((cta) => (
            <a
              key={cta.label}
              href={cta.href}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-100 transition-colors"
            >
              {cta.label.toLowerCase().includes('upscale') ? (
                <HiArrowsPointingOut className="w-3 h-3" />
              ) : (
                <HiSparkles className="w-3 h-3" />
              )}
              {cta.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
