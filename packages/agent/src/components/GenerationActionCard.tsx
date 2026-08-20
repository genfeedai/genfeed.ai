import type {
  AgentUiAction,
  AgentUiActionHandler,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { ThreadAsset } from '@genfeedai/agent/utils/extract-thread-assets';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Image, Video } from 'lucide-react';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { GenerationActionCanvas } from './GenerationActionCanvas';
import { GenerationActionCardControls } from './GenerationActionCardControls';
import { GenerationActionCardHeader } from './GenerationActionCardHeader';
import { GenerationActionCardStatusPanel } from './GenerationActionCardStatusPanel';
import { useGenerationActionCard } from './useGenerationActionCard';

interface GenerationActionCardProps {
  action: AgentUiAction;
  apiService: AgentApiService;
  qualityScore?: number;
  qualityFeedback?: string[];
  onRegenerate?: () => void;
  onUiAction?: AgentUiActionHandler;
  className?: string;
}

function statusLabelFor(
  status: 'idle' | 'generating' | 'done' | 'error',
): string | null {
  switch (status) {
    case 'generating':
      return 'Generating…';
    case 'done':
      return 'Done';
    case 'error':
      return 'Failed';
    default:
      return null;
  }
}

export function GenerationActionCard({
  action,
  apiService,
  qualityScore,
  qualityFeedback,
  onRegenerate,
  onUiAction,
  className,
}: GenerationActionCardProps): ReactElement {
  const {
    generationType,
    prompt,
    setPrompt,
    isAutoMode,
    modelKey,
    aspectRatio,
    duration,
    outputs,
    maxOutputs,
    status,
    resultUrl,
    resultId,
    error,
    prioritize,
    setPrioritize,
    modelsLoading,
    modelsError,
    isAllowlistEmpty,
    retryLoadModels,
    filteredModels,
    autoModelLabel,
    availableAspectRatios,
    showDuration,
    durationOptions,
    textareaRef,
    onRegenerateProp,
    handleRetryVoid,
    handleGenerateVoid,
    handleStop,
    handleToggleReference,
    handleUseResultAsReference,
    handleModelChange,
    handleAspectRatioChange,
    handleDurationChange,
    handleOutputsChange,
    referenceIds,
  } = useGenerationActionCard({
    action,
    apiService,
    onRegenerate,
    onUiAction,
  });

  // The card sits on the composer. Keep the generate form open so the dock
  // is not a header sliver. A new error or idle state expands once so the
  // operator sees it; they can still collapse the card by hand after that.
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (status === 'error' || status === 'idle') {
      setIsCollapsed(false);
    }
  }, [status]);

  const handleToggleAssetReference = useCallback(
    (asset: ThreadAsset) => {
      handleToggleReference(asset.id);
    },
    [handleToggleReference],
  );

  const handleUseAsReference = useCallback(() => {
    handleUseResultAsReference();
    setIsCollapsed(false);
  }, [handleUseResultAsReference]);

  const isImage = generationType === 'image';
  const Icon = isImage ? Image : Video;

  return (
    <div
      className={cn(
        'group/card relative mt-2 overflow-hidden border border-border bg-background',
        className,
      )}
    >
      <GenerationActionCardHeader
        Icon={Icon}
        title={action.title}
        isCollapsed={isCollapsed}
        statusLabel={statusLabelFor(status)}
        onStop={status === 'generating' ? handleStop : undefined}
        onToggleCollapsed={() => setIsCollapsed((current) => !current)}
      />

      {isCollapsed ? (
        status === 'done' ? (
          <div className="border-t border-border p-3">
            <GenerationActionCardStatusPanel
              status={status}
              isImage={isImage}
              resultUrl={resultUrl}
              resultId={resultId}
              error={error}
              generationType={generationType}
              qualityScore={qualityScore}
              qualityFeedback={qualityFeedback}
              onRetry={handleRetryVoid}
              onRegenerateProp={onRegenerateProp}
              onUseAsReference={handleUseAsReference}
            />
          </div>
        ) : null
      ) : (
        <div className="space-y-2 p-3">
          <GenerationActionCardControls
            prompt={prompt}
            onPromptChange={setPrompt}
            textareaRef={textareaRef}
            isDisabled={status === 'generating'}
            modelsLoading={modelsLoading}
            modelsError={modelsError}
            isAllowlistEmpty={isAllowlistEmpty}
            onRetryLoadModels={retryLoadModels}
            filteredModels={filteredModels}
            isAutoMode={isAutoMode}
            modelKey={modelKey}
            autoModelLabel={autoModelLabel}
            prioritize={prioritize}
            onPrioritizeChange={setPrioritize}
            onModelChange={handleModelChange}
            outputs={outputs}
            maxOutputs={maxOutputs}
            onOutputsChange={handleOutputsChange}
            aspectRatio={aspectRatio}
            availableAspectRatios={availableAspectRatios}
            onAspectRatioChange={handleAspectRatioChange}
            showDuration={showDuration}
            duration={duration}
            durationOptions={durationOptions}
            onDurationChange={handleDurationChange}
            isImage={isImage}
            isPromptEmpty={!prompt.trim()}
            showGenerate={status === 'idle' || status === 'error'}
            showStop={status === 'generating'}
            onGenerate={handleGenerateVoid}
            onStop={handleStop}
          />

          {status === 'error' ? (
            <GenerationActionCardStatusPanel
              status={status}
              isImage={isImage}
              resultUrl={resultUrl}
              resultId={resultId}
              error={error}
              generationType={generationType}
              qualityScore={qualityScore}
              qualityFeedback={qualityFeedback}
              onRetry={handleRetryVoid}
              onRegenerateProp={onRegenerateProp}
              onUseAsReference={handleUseAsReference}
            />
          ) : null}

          <GenerationActionCanvas
            generationType={generationType}
            currentResult={
              resultId && resultUrl ? { id: resultId, url: resultUrl } : null
            }
            isDisabled={status === 'generating'}
            referenceIds={referenceIds}
            onToggleReference={handleToggleAssetReference}
          />

          {status !== 'error' ? (
            <GenerationActionCardStatusPanel
              status={status}
              isImage={isImage}
              resultUrl={resultUrl}
              resultId={resultId}
              error={error}
              generationType={generationType}
              qualityScore={qualityScore}
              qualityFeedback={qualityFeedback}
              onRetry={handleRetryVoid}
              onRegenerateProp={onRegenerateProp}
              onUseAsReference={handleUseAsReference}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
