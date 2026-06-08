import type {
  IDesktopGeneratedContent,
  IDesktopMessage,
  IDesktopPublishResult,
} from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { useState } from 'react';

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

type GeneratedContentCardProps = {
  content: IDesktopGeneratedContent;
  onPublish: () => Promise<void>;
  publishResult?: IDesktopPublishResult;
};

export function GeneratedContentCard({
  content,
  onPublish,
  publishResult,
}: GeneratedContentCardProps) {
  const [copied, setCopied] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      await onPublish();
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="generated-card">
      <div className="generated-card-header">
        <span className="platform-badge">{content.platform}</span>
        <span className="content-type-badge">{content.type}</span>
        {publishResult && (
          <span className="status-badge status-active">Published</span>
        )}
      </div>
      <pre className="generated-card-content">{content.content}</pre>
      {content.hooks && content.hooks.length > 0 && (
        <div className="generated-card-hooks">
          <span className="generated-card-hooks-label">Hook options:</span>
          <ol className="generated-hooks-list">
            {content.hooks.map((hook, index) => (
              <li key={`${content.id}-hook-${String(index)}`}>{hook}</li>
            ))}
          </ol>
        </div>
      )}
      {publishResult && (
        <div className="generated-card-publish-meta muted-text">
          Published to {publishResult.platform} at{' '}
          {formatTime(publishResult.publishedAt)}
        </div>
      )}
      <div className="generated-card-actions">
        <Button
          className="small"
          onClick={() => void handleCopy()}
          type="button"
          variant={ButtonVariant.GHOST}
        >
          {copied ? '✓ Copied' : '📋 Copy'}
        </Button>
        <Button
          className="small"
          disabled={isPublishing || publishResult !== undefined}
          onClick={() => void handlePublish()}
          type="button"
          variant={ButtonVariant.GHOST}
        >
          {publishResult
            ? 'Published'
            : isPublishing
              ? 'Publishing…'
              : '🚀 Publish'}
        </Button>
      </div>
    </div>
  );
}

type MessageBubbleProps = {
  message: IDesktopMessage;
  onPublishGeneratedContent?: () => Promise<void>;
  publishResult?: IDesktopPublishResult;
};

export function MessageBubble({
  message,
  onPublishGeneratedContent,
  publishResult,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`message-row ${isUser ? 'message-user' : 'message-ai'}`}>
      {!isUser && <div className="message-avatar">G</div>}
      <div className={`message-bubble ${isUser ? 'bubble-user' : 'bubble-ai'}`}>
        <p className="message-text">{message.content}</p>
        {message.generatedContent && onPublishGeneratedContent && (
          <GeneratedContentCard
            content={message.generatedContent}
            onPublish={onPublishGeneratedContent}
            publishResult={publishResult}
          />
        )}
        <span className="message-time">{formatTime(message.createdAt)}</span>
      </div>
      {isUser && <div className="message-avatar user-avatar-bubble">U</div>}
    </div>
  );
}
