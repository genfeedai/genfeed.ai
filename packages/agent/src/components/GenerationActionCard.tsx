import type {
  AgentUiAction,
  AgentUiActionHandler,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { ThreadAsset } from '@genfeedai/agent/utils/extract-thread-assets';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Image, Video } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
  defaultCollapsed?: boolean;
  qualityScore?: number;
  qualityFeedback?: string[];
  onRegenerate?: () => void;
  onUiAction?: AgentUiActionHandler;
  className?: string;
}

function statusLabelFor(
  status: 'idle' | 'generating' | 'done' | 'error' | 'pilot_review',
): string | null {
  switch (status) {
    case 'generating':
      return 'Generating…';
    case 'done':
      return 'Done';
    case 'error':
      return 'Failed';
    case 'pilot_review':
      return 'Pilot ready';
    default:
      return null;
  }
}

export function GenerationActionCard({
  action,
  apiService,
  defaultCollapsed = false,
  qualityScore,
  qualityFeedback,
  onRegenerate,
  onUiAction,
  className,
}: GenerationActionCardProps): ReactElement {
  const translate = useTranslations('agent.generationActionCard');
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
    estimatedCredits,
    endFrameId,
    textareaRef,
    onRegenerateProp,
    handleRetryVoid,
    handleGenerateVoid,
    handleAcceptPilotVoid,
    handleRejectPilot,
    handleStop,
    isPilotCeilingReached,
    paidRejectedCount,
    pilotDurationSeconds,
    handleToggleReference,
    handleUseResultAsReference,
    handleModelChange,
    handleAspectRatioChange,
    handleDurationChange,
    handleOutputsChange,
    referenceIds,
    referenceNotice,
    resolution,
    resolutionOptions,
    startFrameId,
    supportsEndFrame,
    supportsInterpolation,
    supportsVideoReferences,
    videoReferenceIds,
    handleResolutionChange,
    handleToggleEndFrame,
    handleToggleStartFrame,
    handleToggleVideoReference,
  } = useGenerationActionCard({
    action,
    apiService,
    onRegenerate,
    onUiAction,
  });

  // Docked generation starts as a compact inferred-mode strip; settings open
  // on demand. Errors and pilot review expand automatically because they need
  // a decision, while ordinary idle cards can still default open elsewhere.
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [videoReferenceMode, setVideoReferenceMode] = useState<
    'startFrame' | 'endFrame' | 'videoReference'
  >('startFrame');

  useEffect(() => {
    if (status === 'error' || status === 'pilot_review') {
      setIsCollapsed(false);
    }
  }, [status]);

  useEffect(() => {
    if (
      (videoReferenceMode === 'endFrame' && !supportsEndFrame) ||
      (videoReferenceMode === 'videoReference' && !supportsVideoReferences)
    ) {
      setVideoReferenceMode('startFrame');
    }
  }, [supportsEndFrame, supportsVideoReferences, videoReferenceMode]);

  const handleToggleAssetReference = useCallback(
    (asset: ThreadAsset) => {
      if (generationType === 'image') {
        handleToggleReference(asset.id);
        return;
      }
      if (videoReferenceMode === 'endFrame') {
        handleToggleEndFrame(asset.id);
        return;
      }
      if (videoReferenceMode === 'videoReference') {
        handleToggleVideoReference(asset.id);
        return;
      }
      handleToggleStartFrame(asset.id);
    },
    [
      generationType,
      handleToggleEndFrame,
      handleToggleReference,
      handleToggleStartFrame,
      handleToggleVideoReference,
      videoReferenceMode,
    ],
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
        'group/card relative mt-2 overflow-hidden border border-border bg-background/70 backdrop-blur-xl backdrop-saturate-150',
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
        status === 'done' || status === 'pilot_review' ? (
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
              onAcceptPilot={handleAcceptPilotVoid}
              onRejectPilot={handleRejectPilot}
              pilotDurationSeconds={pilotDurationSeconds}
              isPilotCeilingReached={isPilotCeilingReached}
              paidRejectedCount={paidRejectedCount}
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
            estimatedCredits={estimatedCredits}
            onDurationChange={handleDurationChange}
            resolution={resolution}
            resolutionOptions={resolutionOptions}
            onResolutionChange={handleResolutionChange}
            isImage={isImage}
            isPromptEmpty={!prompt.trim()}
            showGenerate={
              (status === 'idle' || status === 'error') &&
              !isPilotCeilingReached
            }
            showStop={status === 'generating'}
            onGenerate={handleGenerateVoid}
            onStop={handleStop}
          />

          {!isImage ? (
            <div
              aria-label={translate('videoReferenceRoleAria')}
              className="flex flex-wrap items-center gap-1.5"
              role="group"
            >
              <Button
                aria-pressed={videoReferenceMode === 'startFrame'}
                onClick={() => setVideoReferenceMode('startFrame')}
                size={ButtonSize.SM}
                variant={
                  videoReferenceMode === 'startFrame'
                    ? ButtonVariant.SECONDARY
                    : ButtonVariant.GHOST
                }
                withWrapper={false}
              >
                {translate('startFrame')}
              </Button>
              {supportsEndFrame ? (
                <Button
                  aria-pressed={videoReferenceMode === 'endFrame'}
                  isDisabled={supportsInterpolation && !startFrameId}
                  onClick={() => setVideoReferenceMode('endFrame')}
                  size={ButtonSize.SM}
                  variant={
                    videoReferenceMode === 'endFrame'
                      ? ButtonVariant.SECONDARY
                      : ButtonVariant.GHOST
                  }
                  withWrapper={false}
                >
                  {translate('endFrame')}
                </Button>
              ) : null}
              {supportsVideoReferences ? (
                <Button
                  aria-pressed={videoReferenceMode === 'videoReference'}
                  onClick={() => setVideoReferenceMode('videoReference')}
                  size={ButtonSize.SM}
                  variant={
                    videoReferenceMode === 'videoReference'
                      ? ButtonVariant.SECONDARY
                      : ButtonVariant.GHOST
                  }
                  withWrapper={false}
                >
                  {translate('videoReference')}
                </Button>
              ) : null}
            </div>
          ) : null}

          {referenceNotice ? (
            <p className="text-xs text-warning" role="status">
              {referenceNotice}
            </p>
          ) : null}

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
              onAcceptPilot={handleAcceptPilotVoid}
              onRejectPilot={handleRejectPilot}
              pilotDurationSeconds={pilotDurationSeconds}
              isPilotCeilingReached={isPilotCeilingReached}
              paidRejectedCount={paidRejectedCount}
            />
          ) : null}

          <GenerationActionCanvas
            assetType={
              !isImage && videoReferenceMode === 'videoReference'
                ? 'video'
                : 'image'
            }
            generationType={generationType}
            currentResult={
              resultId && resultUrl ? { id: resultId, url: resultUrl } : null
            }
            isDisabled={status === 'generating'}
            referenceIds={
              isImage
                ? referenceIds
                : videoReferenceMode === 'endFrame'
                  ? endFrameId
                    ? [endFrameId]
                    : []
                  : videoReferenceMode === 'videoReference'
                    ? videoReferenceIds
                    : startFrameId
                      ? [startFrameId]
                      : []
            }
            selectionLabel={
              isImage
                ? translate('generationReference')
                : videoReferenceMode === 'endFrame'
                  ? translate('endFrame')
                  : videoReferenceMode === 'videoReference'
                    ? translate('videoReference')
                    : translate('startFrame')
            }
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
              onAcceptPilot={handleAcceptPilotVoid}
              onRejectPilot={handleRejectPilot}
              pilotDurationSeconds={pilotDurationSeconds}
              isPilotCeilingReached={isPilotCeilingReached}
              paidRejectedCount={paidRejectedCount}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
