import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { VoiceCloneStatus, VoiceProvider } from '@genfeedai/contracts';
import { useVisiblePolling } from '@hooks/ui/use-visible-polling/use-visible-polling';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { CircleAlert, Mic } from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { VoiceCloneDoneState } from './VoiceCloneDoneState';
import { VoiceCloneDropzone } from './VoiceCloneDropzone';
import { VoiceCloneExistingVoiceSelector } from './VoiceCloneExistingVoiceSelector';
import { VoiceCloneProgress } from './VoiceCloneProgress';

interface VoiceCloneCardProps {
  action: AgentUiAction;
  apiService: AgentApiService;
}

type CardStatus = 'idle' | 'uploading' | 'cloning' | 'done' | 'error';

const EMPTY_EXISTING_VOICES: NonNullable<AgentUiAction['existingVoices']> = [];
const MAX_VOICE_RECONCILIATION_FAILURES = 10;
const MAX_VOICE_RECONCILIATION_ATTEMPTS = 360;
/** Fallback cadence while the websocket is the primary progress channel. */
const VOICE_RECONCILIATION_INTERVAL_MS = 5000;

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

  const existingVoices = action.existingVoices ?? EMPTY_EXISTING_VOICES;
  const canUseExisting = action.canUseExisting ?? existingVoices.length > 0;
  const canUpload = action.canUpload ?? true;

  // Prefer explicit selection; fall back to recommended without an effect.
  const effectiveSelectedVoiceId =
    selectedVoiceId || action.recommendedVoiceId || '';

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

      // cloneStatus is a Prisma enum (SCREAMING labels); normalize the
      // socket payload once and compare with enum members only.
      const nextStatus = payload.status?.toUpperCase();
      if (nextStatus === VoiceCloneStatus.READY) {
        setProgress(100);
        setStatus('done');
      } else if (nextStatus === VoiceCloneStatus.FAILED) {
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

  const reconciliationAbortRef = useRef<AbortController | null>(null);
  const reconciliationVoiceIdRef = useRef<string | null>(null);
  const reconciliationFailuresRef = useRef(0);
  const reconciliationAttemptsRef = useRef(0);

  // Each cloned voice gets its own attempt budget, and switching voices aborts
  // the request still in flight for the previous one.
  useEffect(() => {
    const controller = new AbortController();

    reconciliationAbortRef.current = controller;
    reconciliationVoiceIdRef.current = activeVoiceId;
    reconciliationFailuresRef.current = 0;
    reconciliationAttemptsRef.current = 0;

    return () => {
      controller.abort();
    };
  }, [activeVoiceId]);

  const reconcileVoiceClone = useCallback(async () => {
    const signal = reconciliationAbortRef.current?.signal;

    if (!activeVoiceId) {
      return;
    }

    // A response for a voice the card has moved on from must not resolve the
    // one on screen; the abort signal only covers the request that carries it.
    const isStillReconciling = (): boolean =>
      reconciliationVoiceIdRef.current === activeVoiceId;

    if (action.voiceoverText) {
      reconciliationAttemptsRef.current += 1;

      try {
        const asset = await runAgentApiEffect(
          apiService.getGeneratedAssetEffect(activeVoiceId, signal),
        );

        if (!isStillReconciling()) {
          return;
        }

        reconciliationFailuresRef.current = 0;
        const nextStatus = asset.status.toUpperCase();

        if (nextStatus === 'GENERATED' || nextStatus === 'VALIDATED') {
          setProgress(100);
          setStatus('done');
        } else if (
          ['ARCHIVED', 'CANCELLED', 'FAILED', 'REJECTED'].includes(nextStatus)
        ) {
          setStatus('error');
          setError('Voice generation failed. Please try again.');
        } else if (
          reconciliationAttemptsRef.current >= MAX_VOICE_RECONCILIATION_ATTEMPTS
        ) {
          setStatus('error');
          setError(
            'Voice generation is taking longer than expected. Please try again.',
          );
        }
      } catch {
        if (!isStillReconciling()) {
          return;
        }

        reconciliationFailuresRef.current += 1;

        if (
          reconciliationFailuresRef.current >= MAX_VOICE_RECONCILIATION_FAILURES
        ) {
          setStatus('error');
          setError('Unable to reconcile voice generation. Please try again.');
        }
      }

      return;
    }

    try {
      const voices = await runAgentApiEffect(
        apiService.getClonedVoicesEffect(),
      );

      if (!isStillReconciling()) {
        return;
      }

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
    } catch {
      // Intentionally ignored — websocket updates are primary, polling is fallback.
    }
  }, [action.voiceoverText, activeVoiceId, apiService]);

  useVisiblePolling(reconcileVoiceClone, {
    intervalMs: VOICE_RECONCILIATION_INTERVAL_MS,
    isEnabled: status === 'cloning' && Boolean(activeVoiceId),
  });

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
    if (!effectiveSelectedVoiceId) {
      setError('Select a voice first.');
      return;
    }

    if (!action.brandId && !action.voiceoverText) {
      setError('No active brand found. Select a brand and retry.');
      return;
    }

    setStatus('uploading');
    setError(null);

    try {
      if (action.brandId) {
        await runAgentApiEffect(
          apiService.setBrandVoiceDefaultsEffect(action.brandId, {
            defaultVoiceId: effectiveSelectedVoiceId,
          }),
        );
      }
      if (action.voiceoverText) {
        const accepted = await runAgentApiEffect(
          apiService.generateVoiceEffect({
            sourceActionId: action.id,
            text: action.voiceoverText,
            voiceId: effectiveSelectedVoiceId,
            waitForCompletion: false,
          }),
        );
        setActiveVoiceId(accepted.id);
        setProgress(10);
        setStatus('cloning');
        return;
      }
      setStatus('done');
    } catch (err: unknown) {
      setStatus('error');
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to set default voice for this brand.',
      );
    }
  }, [
    action.brandId,
    action.id,
    action.voiceoverText,
    apiService,
    effectiveSelectedVoiceId,
  ]);

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

      if (voice.cloneStatus === VoiceCloneStatus.READY) {
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
        <Mic className="size-5 text-rose-500" />
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
          selectedVoiceId={effectiveSelectedVoiceId}
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
          <CircleAlert className="size-4" />
          {error}
        </p>
      )}
    </div>
  );
}
