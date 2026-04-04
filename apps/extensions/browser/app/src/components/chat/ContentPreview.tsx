import { type ReactElement, useState } from 'react';

import type { ChatMessage } from '~models/chat.model';
import { usePlatformStore } from '~store/use-platform-store';

interface ContentPreviewProps {
  message: ChatMessage;
}

const PLATFORM_CHAR_LIMITS: Record<string, number> = {
  facebook: 63206,
  instagram: 2200,
  linkedin: 3000,
  reddit: 40000,
  tiktok: 2200,
  twitter: 280,
  youtube: 5000,
};

type InsertStatus =
  | 'idle'
  | 'inserting'
  | 'inserted'
  | 'publishing'
  | 'published'
  | 'failed';

export function ContentPreview({ message }: ContentPreviewProps): ReactElement {
  const [copied, setCopied] = useState(false);
  const [insertStatus, setInsertStatus] = useState<InsertStatus>('idle');
  const currentPlatform = usePlatformStore((s) => s.currentPlatform);
  const composeBoxAvailable = usePlatformStore((s) => s.composeBoxAvailable);
  const canSubmitFromComposer = usePlatformStore(
    (s) => s.canSubmitFromComposer,
  );

  const content = message.metadata?.generatedContent ?? message.content;
  const charLimit = currentPlatform
    ? PLATFORM_CHAR_LIMITS[currentPlatform]
    : undefined;

  async function handleCopy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleInsert() {
    setInsertStatus('inserting');
    chrome.runtime.sendMessage(
      {
        event: 'RELAY_TO_CONTENT',
        payload: {
          content,
          platform: currentPlatform,
          type: 'INSERT_CONTENT',
        },
      },
      (response) => {
        if (response?.success) {
          setInsertStatus('inserted');
          setTimeout(() => setInsertStatus('idle'), 2500);
        } else {
          setInsertStatus('failed');
          setTimeout(() => setInsertStatus('idle'), 3000);
        }
      },
    );
  }

  function handleInsertAndPublish() {
    setInsertStatus('publishing');
    chrome.runtime.sendMessage(
      {
        event: 'RELAY_TO_CONTENT',
        payload: {
          content,
          platform: currentPlatform,
          type: 'INSERT_AND_PUBLISH_CONTENT',
        },
      },
      (response) => {
        if (response?.success) {
          setInsertStatus('published');
          setTimeout(() => setInsertStatus('idle'), 2500);
        } else {
          setInsertStatus('failed');
          setTimeout(() => setInsertStatus('idle'), 3000);
        }
      },
    );
  }

  function handleRegenerate() {
    chrome.runtime.sendMessage({
      event: 'chatSendMessage',
      payload: {
        content: 'Regenerate the previous response with a different approach',
        threadId: message.threadId,
      },
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-sm leading-relaxed">{message.content}</p>

      <div className="rounded-lg border border-border bg-background p-3">
        <p className="whitespace-pre-wrap text-sm text-foreground">{content}</p>

        {charLimit && (
          <div className="mt-2 flex items-center gap-1">
            <div className="h-1 flex-1 rounded-full bg-border">
              <div
                className={`h-1 rounded-full transition-all ${
                  content.length > charLimit ? 'bg-destructive' : 'bg-primary'
                }`}
                style={{
                  width: `${Math.min((content.length / charLimit) * 100, 100)}%`,
                }}
              />
            </div>
            <span
              className={`text-[10px] ${
                content.length > charLimit
                  ? 'text-destructive'
                  : 'text-muted-foreground'
              }`}
            >
              {content.length}/{charLimit}
            </span>
          </div>
        )}

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="rounded bg-secondary px-2.5 py-1 text-xs text-secondary-foreground transition-colors hover:bg-accent"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>

          {composeBoxAvailable &&
            insertStatus !== 'inserted' &&
            insertStatus !== 'published' && (
              <button
                type="button"
                onClick={handleInsert}
                disabled={
                  insertStatus === 'inserting' || insertStatus === 'publishing'
                }
                className="rounded bg-primary px-2.5 py-1 text-xs text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {insertStatus === 'inserting' ? 'Inserting...' : 'Insert'}
              </button>
            )}

          {composeBoxAvailable && canSubmitFromComposer && (
            <button
              type="button"
              onClick={handleInsertAndPublish}
              disabled={
                insertStatus === 'inserting' || insertStatus === 'publishing'
              }
              className="rounded bg-primary/80 px-2.5 py-1 text-xs text-primary-foreground transition-colors hover:bg-primary disabled:opacity-50"
            >
              {insertStatus === 'publishing' ? 'Posting...' : 'Insert + Post'}
            </button>
          )}

          {insertStatus === 'inserted' && (
            <span className="text-xs text-success">Inserted</span>
          )}

          {insertStatus === 'published' && (
            <span className="text-xs text-success">Posted</span>
          )}

          {insertStatus === 'failed' && (
            <span className="text-xs text-destructive">Insert failed</span>
          )}

          <button
            type="button"
            onClick={handleRegenerate}
            className="rounded bg-secondary px-2.5 py-1 text-xs text-secondary-foreground transition-colors hover:bg-accent"
          >
            Regenerate
          </button>
        </div>
      </div>
    </div>
  );
}
