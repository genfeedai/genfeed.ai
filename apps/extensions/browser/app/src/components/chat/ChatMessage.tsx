import { type ReactElement } from 'react';

import { ContentPreview } from '~components/chat/ContentPreview';
import type { ChatMessage as ChatMessageType } from '~models/chat.model';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps): ReactElement {
  const isUser = message.role === 'user';
  const hasGeneratedContent = !!message.metadata?.generatedContent;

  return (
    <div
      className={`mb-3 flex ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-1 duration-200`}
    >
      <div
        className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-secondary text-secondary-foreground'
        }`}
      >
        {hasGeneratedContent ? (
          <ContentPreview message={message} />
        ) : (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        )}
        <time
          className={`mt-1 block text-[10px] ${isUser ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}
        >
          {formatTime(message.createdAt)}
        </time>
      </div>
    </div>
  );
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
