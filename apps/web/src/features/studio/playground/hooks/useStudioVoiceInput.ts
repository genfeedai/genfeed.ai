'use client';

import type { useAgentApiService } from '@genfeedai/agent';
import { useMicrophoneInput } from '@genfeedai/agent/hooks/use-microphone-input';
import type { NotificationsService } from '@services/core/notifications.service';
import { useCallback } from 'react';
import type { StudioWorkspaceScope } from '@/features/studio/props/studio-playground-workspace.props';

export interface UseStudioVoiceInputParams {
  agentApiService: ReturnType<typeof useAgentApiService>;
  notificationsService: NotificationsService;
  setPrompt: StudioWorkspaceScope['setPrompt'];
}

/** Microphone dictation that appends the transcript to the prompt. */
export function useStudioVoiceInput({
  agentApiService,
  notificationsService,
  setPrompt,
}: UseStudioVoiceInputParams) {
  const appendTranscript = useCallback(
    (transcript: string) => {
      setPrompt((current) =>
        current.trim() ? `${current.trim()} ${transcript}` : transcript,
      );
    },
    [setPrompt],
  );
  const getVoiceToken = useCallback(
    () => agentApiService?.getToken() ?? Promise.resolve(null),
    [agentApiService],
  );
  const {
    isListening,
    isSupported: isVoiceSupported,
    isTranscribing,
    startListening,
    stopListening,
  } = useMicrophoneInput({
    apiBaseUrl: agentApiService?.baseUrl ?? '',
    getToken: getVoiceToken,
    onError: (error) => {
      notificationsService.error('Voice transcription failed', {
        description: error,
      });
    },
    onTranscript: appendTranscript,
  });
  return {
    isListening,
    isTranscribing,
    isVoiceSupported,
    startListening,
    stopListening,
  };
}
