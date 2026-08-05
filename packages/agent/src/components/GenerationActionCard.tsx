import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { AgentUiActionHandler } from '@genfeedai/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Image, Video } from 'lucide-react';
import type { ReactElement } from 'react';

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
    status,
    resultUrl,
    resultId,
    error,
    prioritize,
    setPrioritize,
    modelsLoading,
    filteredModels,
    autoModelLabel,
    availableAspectRatios,
    showDuration,
    durationOptions,
    textareaRef,
    onRegenerateProp,
    handleRetryVoid,
    handleGenerateVoid,
    handleModelChange,
    handleAspectRatioChange,
    handleDurationChange,
  } = useGenerationActionCard({
    action,
    apiService,
    onRegenerate,
    onUiAction,
  });

  const isImage = generationType === 'image';
  const Icon = isImage ? Image : Video;

  return (
    <div
      className={cn(
        'group/card relative mt-2 overflow-hidden border border-border bg-background',
        className,
      )}
    >
      <GenerationActionCardHeader Icon={Icon} title={action.title} />

      <div className="space-y-3 p-3">
        <GenerationActionCardControls
          prompt={prompt}
          onPromptChange={setPrompt}
          textareaRef={textareaRef}
          isDisabled={status === 'generating'}
          modelsLoading={modelsLoading}
          filteredModels={filteredModels}
          isAutoMode={isAutoMode}
          modelKey={modelKey}
          autoModelLabel={autoModelLabel}
          prioritize={prioritize}
          onPrioritizeChange={setPrioritize}
          onModelChange={handleModelChange}
          aspectRatio={aspectRatio}
          availableAspectRatios={availableAspectRatios}
          onAspectRatioChange={handleAspectRatioChange}
          showDuration={showDuration}
          duration={duration}
          durationOptions={durationOptions}
          onDurationChange={handleDurationChange}
          isImage={isImage}
          isPromptEmpty={!prompt.trim()}
          showGenerate={status === 'idle'}
          onGenerate={handleGenerateVoid}
        />

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
        />
      </div>
    </div>
  );
}
