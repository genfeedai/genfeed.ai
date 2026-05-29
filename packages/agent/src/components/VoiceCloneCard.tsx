import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { VoiceCloneStatus, VoiceProvider } from '@genfeedai/enums';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { HiExclamationCircle, HiMicrophone } from 'react-icons/hi2';
import { VoiceCloneDoneState } from './VoiceCloneDoneState';
import { VoiceCloneDropzone } from './VoiceCloneDropzone';
import { VoiceCloneExistingVoiceSelector } from './VoiceCloneExistingVoiceSelector';
import { VoiceCloneProgress } from './VoiceCloneProgress';

interface VoiceCloneCardProps {
  action: AgentUiAction;
  apiService: AgentApiService;
}

type CardStatus = 'idle' | 'uploading' | 'cloning' | 'done' | 'error';

export function VoiceCloneCard({
  action,
  apiService,
}: VoiceCloneCardProps): ReactElement {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<CardStatus>('idle');
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(
    action.recommendedVoiceId ?? '',
  );
  const [activeVoiceId, setActiveVoiceId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(action.cloneProgress ?? 0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isReady, subscribe } = useSocketManager();

  const existingVoices = useMemo(
    () => action.existingVoices ?? [],
    [action.existingVoices],
  );
  const canUseExisting = action.canUseExisting ?? existingVoices.length > 0;
  const canUpload = action.canUpload ?? true;

  useEffect(() => {
    if (!selectedVoiceId && action.recommendedVoiceId) {
      setSelectedVoiceId(action.recommendedVoiceId);
    }
  }, [action.recommendedVoiceId, selectedVoiceId]);

  useEffect(() => {
    if (!isReady || !activeVoiceId) {
      return;
    }

    const dispose = subscribe<{
      assetId?: string;
      status?: string;
      metadata?: Record<string, unknown>;
    }>('asset-status', (payload) => {
      if (payload.assetId !== activeVoiceId) {
        return;
      }

      const nextStatus = payload.status?.toLowerCase();
      if (nextStatus === VoiceCloneStatus.READY || nextStatus === 'ready') {
        setProgress(100);
        setStatus('done');
      } else if (
        nextStatus === VoiceCloneStatus.FAILED ||
        nextStatus === 'failed'
      ) {
        setStatus('error');
        setError('Voice clone failed. Please try again.');
      } else if (nextStatus === VoiceCloneStatus.CLONING) {
        setStatus('cloning');
        const nextProgress = Number(payload.metadata?.progress ?? 40);
        if (Number.isFinite(nextProgress)) {
          setProgress(Math.max(0, Math.min(99, nextProgress)));
        }
      }
    });

    return () => {
      dispose();
    };
  }, [activeVoiceId, isReady, subscribe]);

  useEffect(() => {
    if (status !== 'cloning' || !activeVoiceId) {
      return;
    }

    const interval = window.setInterval(() => {
      runAgentApiEffect(apiService.getClonedVoicesEffect())
        .then((voices) => {
          const voice = voices.find((item) => item.id === activeVoiceId);
          if (!voice?.cloneStatus) {
            return;
          }

          if (voice.cloneStatus === VoiceCloneStatus.READY) {
            setProgress(100);
            setStatus('done');
            return;
          }

          if (voice.cloneStatus === VoiceCloneStatus.FAILED) {
            setStatus('error');
            setError('Voice clone failed. Please try again.');
          }
        })
        .catch(() => {
          // Intentionally ignored — websocket updates are primary, polling is fallback.
        });
    }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, [activeVoiceId, apiService, status]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) {
        setFile(selected);
        setError(null);
      }
    },
    [],
  );

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped?.type.startsWith('audio/')) {
      setFile(dropped);
      setError(null);
    } else {
      setError('Please drop an audio file');
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleUseExisting = useCallback(async () => {
    if (!selectedVoiceId) {
      setError('Select a voice first.');
      return;
    }

    if (!action.brandId) {
      setError('No active brand found. Select a brand and retry.');
      return;
    }

    setStatus('uploading');
    setError(null);

    try {
      await runAgentApiEffect(
        apiService.setBrandVoiceDefaultsEffect(action.brandId, {
          defaultVoiceId: selectedVoiceId,
        }),
      );
      setStatus('done');
    } catch (err: unknown) {
      setStatus('error');
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to set default voice for this brand.',
      );
    }
  }, [action.brandId, apiService, selectedVoiceId]);

  const handleClone = useCallback(async () => {
    if (!file) {
      return;
    }
    setStatus('uploading');
    setError(null);

    try {
      const formData = new FormData();
      formData.append('name', file.name.replace(/\.[^.]+$/, '') || 'My Voice');
      formData.append('provider', VoiceProvider.ELEVENLABS);
      formData.append('file', file);
      const voice = await runAgentApiEffect(
        apiService.cloneVoiceEffect(formData),
      );
      setActiveVoiceId(voice.id);

      if (action.brandId) {
        await runAgentApiEffect(
          apiService.setBrandVoiceDefaultsEffect(action.brandId, {
            defaultVoiceId: voice.id,
          }),
        );
      }

      if (
        voice.cloneStatus === VoiceCloneStatus.READY ||
        voice.cloneStatus === 'ready'
      ) {
        setProgress(100);
        setStatus('done');
        return;
      }

      setProgress(30);
      setStatus('cloning');
    } catch (err: unknown) {
      setStatus('error');
      setError(
        err instanceof Error ? err.message : 'Failed to start voice cloning.',
      );
    }
  }, [action.brandId, apiService, file]);

  if (status === 'done') {
    return <VoiceCloneDoneState />;
  }

  return (
    <div className="my-2 border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <HiMicrophone className="size-5 text-rose-500" />
        <h3 className="text-sm font-semibold">
          {action.title || 'Clone Voice'}
        </h3>
      </div>

      {action.description && (
        <p className="mb-3 text-xs text-muted-foreground">
          {action.description}
        </p>
      )}

      {/* Audio preview if provided */}
      {action.audioUrl && (
        <div className="mb-3">
          <audio
            src={action.audioUrl}
            controls
            aria-label="Voice preview"
            className="w-full"
          >
            <track kind="captions" />
          </audio>
        </div>
      )}

      {canUseExisting && (
        <VoiceCloneExistingVoiceSelector
          existingVoices={existingVoices}
          selectedVoiceId={selectedVoiceId}
          status={status}
          onValueChange={(value) => setSelectedVoiceId(value)}
          onUseExisting={handleUseExisting}
        />
      )}

      {canUpload && (
        <VoiceCloneDropzone
          file={file}
          status={status}
          fileInputRef={fileInputRef}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onFileChange={handleFileChange}
          onClone={handleClone}
        />
      )}

      {/* Progress (when cloning is in progress from server) */}
      {status === 'cloning' && progress > 0 && progress < 100 && (
        <VoiceCloneProgress progress={progress} />
      )}

      {/* Error */}
      {error && (
        <p className="mt-3 flex items-center gap-1 text-xs text-red-500">
          <HiExclamationCircle className="size-4" />
          {error}
        </p>
      )}
    </div>
  );
}
