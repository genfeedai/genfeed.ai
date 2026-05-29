import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { ReactElement } from 'react';
import { HiOutlinePhoto, HiOutlineVideoCamera } from 'react-icons/hi2';
import { GenerationActionCardControls } from './GenerationActionCardControls';
import { GenerationActionCardHeader } from './GenerationActionCardHeader';
import { GenerationActionCardHoverActions } from './GenerationActionCardHoverActions';
import { GenerationActionCardStatusPanel } from './GenerationActionCardStatusPanel';
import { useGenerationActionCard } from './useGenerationActionCard';

interface GenerationActionCardProps {
  action: AgentUiAction;
  apiService: AgentApiService;
  qualityScore?: number;
  qualityFeedback?: string[];
  onRegenerate?: () => void;
}

export function GenerationActionCard({
  action,
  apiService,
  qualityScore,
  qualityFeedback,
  onRegenerate,
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
    handleCopyPrompt,
    handleRetryVoid,
    handleGenerateVoid,
    handleModelChange,
    handleAspectRatioChange,
    handleDurationChange,
  } = useGenerationActionCard({ action, apiService, onRegenerate });

  const isImage = generationType === 'image';
  const Icon = isImage ? HiOutlinePhoto : HiOutlineVideoCamera;

  return (
    <div className="group/card relative mt-2 overflow-hidden border border-border bg-background">
      <GenerationActionCardHoverActions
        canCopy={!!prompt.trim()}
        onCopy={handleCopyPrompt}
        onRetry={handleRetryVoid}
      />

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
        />

        <GenerationActionCardStatusPanel
          status={status}
          isImage={isImage}
          isPromptEmpty={!prompt.trim()}
          resultUrl={resultUrl}
          resultId={resultId}
          error={error}
          generationType={generationType}
          qualityScore={qualityScore}
          qualityFeedback={qualityFeedback}
          onGenerate={handleGenerateVoid}
          onRetry={handleRetryVoid}
          onRegenerateProp={onRegenerateProp}
        />
      </div>
    </div>
  );
}
