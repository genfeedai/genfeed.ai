export function getVoiceTooltip(
  isRecording: boolean,
  isProcessing: boolean,
): string {
  if (isRecording) {
    return 'Stop recording';
  }
  if (isProcessing) {
    return 'Processing…';
  }
  return 'Voice input (Speak to transcribe)';
}
