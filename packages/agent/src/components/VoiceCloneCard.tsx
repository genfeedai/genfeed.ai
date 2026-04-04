import type { AgentUiAction } from '@cloud/agent/models/agent-chat.model';
import type { AgentApiService } from '@cloud/agent/services/agent-api.service';
import { runAgentApiEffect } from '@cloud/agent/services/agent-base-api.service';
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
import {
  HiCheck,
  HiCloudArrowUp,
  HiExclamationCircle,
  HiMicrophone,
  HiMusicalNote,
} from 'react-icons/hi2';

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
    return (
      <div className="my-2 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <HiCheck className="h-5 w-5" />
          <span className="text-sm font-medium">
            Voice is ready and set for this brand
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <HiMicrophone className="h-5 w-5 text-rose-500" />
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
          <audio src={action.audioUrl} controls className="w-full">
            <track kind="captions" />
          </audio>
        </div>
      )}

      {canUseExisting && (
        <div className="mb-3 space-y-2">
          <p className="text-xs font-medium text-foreground">
            Use existing voice
          </p>
          <select
            value={selectedVoiceId}
            onChange={(e) => setSelectedVoiceId(e.target.value)}
            className="w-full rounded border border-border bg-background px-3 py-2 text-xs text-foreground"
            disabled={status === 'uploading' || status === 'cloning'}
          >
            <option value="">Select a cloned voice</option>
            {existingVoices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.label} ({voice.provider ?? 'unknown'})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleUseExisting}
            disabled={!selectedVoiceId || status === 'uploading'}
            className="flex w-full items-center justify-center gap-2 rounded border border-border px-4 py-2 text-sm font-black text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            Use Selected Voice
          </button>
        </div>
      )}

      {canUpload && (
        <>
          {/* Audio dropzone */}
          <button
            type="button"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                fileInputRef.current?.click();
              }
            }}
            className="mb-3 flex cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed border-border p-6 transition-colors hover:border-primary/50 hover:bg-muted/50"
          >
            <HiCloudArrowUp className="mb-2 h-8 w-8 text-muted-foreground" />
            {file ? (
              <div className="flex items-center gap-2">
                <HiMusicalNote className="h-4 w-4 text-rose-500" />
                <span className="text-xs font-medium text-foreground">
                  {file.name}
                </span>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-xs font-medium text-foreground">
                  Drop audio file here
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  or click to browse (MP3, WAV, M4A)
                </p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </button>

          {/* Clone button */}
          <button
            type="button"
            onClick={handleClone}
            disabled={!file || status === 'uploading' || status === 'cloning'}
            className="flex w-full items-center justify-center gap-2 rounded bg-primary px-4 py-2 text-sm font-black text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <HiMicrophone className="h-4 w-4" />
            {status === 'uploading' ? 'Uploading…' : 'Clone New Voice'}
          </button>
        </>
      )}

      {/* Progress (when cloning is in progress from server) */}
      {status === 'cloning' && progress > 0 && progress < 100 && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Cloning in progress...</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-rose-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="mt-3 flex items-center gap-1 text-xs text-red-500">
          <HiExclamationCircle className="h-4 w-4" />
          {error}
        </p>
      )}
    </div>
  );
}
