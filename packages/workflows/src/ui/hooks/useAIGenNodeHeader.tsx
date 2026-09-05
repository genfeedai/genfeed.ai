import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@genfeedai/ui/primitives/button';
import { ChevronDown, Expand, Play, Square } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';

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
        withWrapper={false}
        variant={ButtonVariant.GHOST}
        className={`flex flex-1 items-center gap-1 text-sm font-medium text-left text-foreground h-auto p-0 ${isProcessing ? 'opacity-50 cursor-default' : 'hover:text-foreground/80 cursor-pointer'}`}
        onClick={() => !isProcessing && onModelBrowse()}
        title="Browse models"
        disabled={isProcessing}
      >
        <span className="truncate">{modelDisplayName}</span>
        <ChevronDown className="size-3 shrink-0" />
      </Button>
    ),
    [modelDisplayName, isProcessing, onModelBrowse],
  );

  const headerActions = useMemo(
    () => (
      <>
        {hasOutput && (
          <Button
            withWrapper={false}
            variant={ButtonVariant.GHOST}
            size={ButtonSize.ICON}
            onClick={onExpand}
            title="Expand preview"
          >
            <Expand className="size-3" />
          </Button>
        )}
        {isProcessing ? (
          <Button
            withWrapper={false}
            variant={ButtonVariant.DESTRUCTIVE}
            size={ButtonSize.SM}
            onClick={onStop}
          >
            <Square className="size-4 fill-current" />
            Generating
          </Button>
        ) : (
          <Button
            withWrapper={false}
            variant={
              canGenerate ? ButtonVariant.DEFAULT : ButtonVariant.SECONDARY
            }
            size={ButtonSize.SM}
            onClick={onGenerate}
            disabled={!canGenerate}
          >
            <Play className="size-4 fill-current" />
            Generate
          </Button>
        )}
      </>
    ),
    [hasOutput, isProcessing, canGenerate, onGenerate, onStop, onExpand],
  );

  return { headerActions, titleElement };
}
