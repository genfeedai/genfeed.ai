import { type ReactElement, useEffect, useRef } from 'react';

import { BrandVoiceIndicator } from '~components/chat/BrandVoiceIndicator';
import { ChatActionChips } from '~components/chat/ChatActionChips';
import { ChatInput } from '~components/chat/ChatInput';
import { ChatMessage } from '~components/chat/ChatMessage';
import { PlatformBanner } from '~components/chat/PlatformBanner';
import { LoadingSpinner } from '~components/ui';
import { useChat } from '~hooks/use-chat';
import { usePlatformDetection } from '~hooks/use-platform-detection';
import { useChatStore } from '~store/use-chat-store';
import { usePlatformStore } from '~store/use-platform-store';

export function ChatContainer(): ReactElement {
  const messages = useChatStore((s) => s.messages);
  const isGenerating = useChatStore((s) => s.isGenerating);
  const error = useChatStore((s) => s.error);
  const setError = useChatStore((s) => s.setError);
  const currentPlatform = usePlatformStore((s) => s.currentPlatform);
  const { sendMessage } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  usePlatformDetection();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  function handleSend(content: string) {
    sendMessage(content);
  }

  function handleChipClick(prompt: string) {
    sendMessage(prompt);
  }

  return (
    <div className="flex h-full flex-col">
      <PlatformBanner />
      <BrandVoiceIndicator />

      {error && (
        <div className="mx-3 mt-2 flex items-center justify-between rounded bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 text-destructive hover:text-destructive/80"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="text-3xl">&#x1f4ac;</div>
            <p className="text-sm font-medium text-foreground">
              Start a thread
            </p>
            <p className="text-xs text-muted-foreground">
              {currentPlatform
                ? `Generate content for ${currentPlatform}`
                : 'Ask me to write posts, replies, captions, and more'}
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            {isGenerating && (
              <div className="flex items-center gap-2 py-3">
                <LoadingSpinner size="sm" className="text-primary" />
                <span className="text-xs text-muted-foreground">
                  Generating...
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <div className="border-t border-border">
        <ChatActionChips onChipClick={handleChipClick} />
        <ChatInput onSend={handleSend} disabled={isGenerating} />
      </div>
    </div>
  );
}
