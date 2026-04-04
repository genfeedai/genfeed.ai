import { TranscriptStatus } from '@genfeedai/enums';
import { useState } from 'react';
import { ButtonSpinner } from '~components/ui';

const STATUS_MESSAGES: Record<TranscriptStatus, string> = {
  [TranscriptStatus.PENDING]: 'Waiting to start...',
  [TranscriptStatus.DOWNLOADING]: 'Downloading audio from YouTube...',
  [TranscriptStatus.TRANSCRIBING]: 'Transcribing audio...',
  [TranscriptStatus.GENERATING_ARTICLE]: 'Generating article...',
  [TranscriptStatus.COMPLETED]: 'Article generated successfully!',
  [TranscriptStatus.FAILED]: 'Processing failed',
};

function getStatusMessage(status: TranscriptStatus): string {
  return STATUS_MESSAGES[status] || 'Processing...';
}

export function TranscriptPage() {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [status, setStatus] = useState<TranscriptStatus | null>(null);
  const [transcriptId, setTranscriptId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  function pollStatus(id: string): void {
    const POLL_INTERVAL_MS = 3000;

    const interval = setInterval(async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          payload: { transcriptId: id },
          type: 'GET_TRANSCRIPT_STATUS',
        });

        if (response.status) {
          setStatus(response.status);

          if (
            response.status === TranscriptStatus.COMPLETED ||
            response.status === TranscriptStatus.FAILED
          ) {
            clearInterval(interval);
          }
        }
      } catch {
        clearInterval(interval);
      }
    }, POLL_INTERVAL_MS);
  }

  async function handleSubmit(): Promise<void> {
    if (!youtubeUrl) {
      setError('Please enter a YouTube URL');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const response = await chrome.runtime.sendMessage({
        payload: { youtubeUrl },
        type: 'PROCESS_YOUTUBE_TRANSCRIPT',
      });

      if (response.success) {
        setTranscriptId(response.transcriptId);
        setStatus(response.status);
        pollStatus(response.transcriptId);
      } else {
        setError(response.error || 'Failed to process YouTube video');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-4">YouTube to Article</h2>
      <p className="text-sm text-gray-600 mb-4">
        Convert any YouTube video into a blog article
      </p>

      <input
        type="url"
        value={youtubeUrl}
        onChange={(e) => setYoutubeUrl(e.target.value)}
        placeholder="Paste YouTube URL..."
        className="flex h-9 w-full border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 mb-4"
        disabled={isProcessing}
      />

      <button
        type="button"
        onClick={handleSubmit}
        className="inline-flex items-center justify-center h-9 px-4 py-2 w-full text-sm font-medium bg-primary text-primary-foreground shadow hover:bg-primary/90 transition-colors disabled:pointer-events-none disabled:opacity-50"
        disabled={!youtubeUrl || isProcessing}
      >
        {isProcessing ? (
          <ButtonSpinner text="Processing..." />
        ) : (
          'Generate Article'
        )}
      </button>

      {status && (
        <div className="mt-4">
          <div className="relative w-full border border-info/50 bg-background px-4 py-3 text-sm text-info flex items-center gap-2">
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              className="stroke-current shrink-0 w-6 h-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              ></path>
            </svg>
            <span>{getStatusMessage(status)}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="relative w-full border border-destructive/50 bg-background px-4 py-3 text-sm text-destructive flex items-center gap-2 mt-4">
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            className="stroke-current shrink-0 h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {status === TranscriptStatus.COMPLETED && transcriptId && (
        <div className="mt-4">
          <a
            href={`https://app.genfeed.ai/transcripts/${transcriptId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-9 px-4 py-2 w-full text-sm font-medium bg-success text-success-foreground shadow hover:bg-success/90 transition-colors"
          >
            View Article
          </a>
        </div>
      )}
    </div>
  );
}
