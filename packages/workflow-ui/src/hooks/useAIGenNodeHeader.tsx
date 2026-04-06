import { ChevronDown, Expand, Play, Square } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import { Button } from '../ui/button';

interface UseAIGenNodeHeaderOptions {
  modelDisplayName: string;
  isProcessing: boolean;
  canGenerate: boolean;
  hasOutput: boolean;
  onModelBrowse: () => void;
  onGenerate: () => void;
  onStop: () => void;
  onExpand: () => void;
}

export function useAIGenNodeHeader({
  modelDisplayName,
  isProcessing,
  canGenerate,
  hasOutput,
  onModelBrowse,
  onGenerate,
  onStop,
  onExpand,
}: UseAIGenNodeHeaderOptions): {
  titleElement: ReactNode;
  headerActions: ReactNode;
} {
  const titleElement = useMemo(
    () => (
      <Button
        variant="ghost"
        className={`flex flex-1 items-center gap-1 text-sm font-medium text-left text-foreground h-auto p-0 ${isProcessing ? 'opacity-50 cursor-default' : 'hover:text-foreground/80 cursor-pointer'}`}
        onClick={() => !isProcessing && onModelBrowse()}
        title="Browse models"
        disabled={isProcessing}
      >
        <span className="truncate">{modelDisplayName}</span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </Button>
    ),
    [modelDisplayName, isProcessing, onModelBrowse],
  );

  const headerActions = useMemo(
    () => (
      <>
        {hasOutput && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onExpand}
            title="Expand preview"
          >
            <Expand className="h-3 w-3" />
          </Button>
        )}
        {isProcessing ? (
          <Button variant="destructive" size="sm" onClick={onStop}>
            <Square className="h-4 w-4 fill-current" />
            Generating
          </Button>
        ) : (
          <Button
            variant={canGenerate ? 'default' : 'secondary'}
            size="sm"
            onClick={onGenerate}
            disabled={!canGenerate}
          >
            <Play className="h-4 w-4 fill-current" />
            Generate
          </Button>
        )}
      </>
    ),
    [hasOutput, isProcessing, canGenerate, onGenerate, onStop, onExpand],
  );

  return { headerActions, titleElement };
}
