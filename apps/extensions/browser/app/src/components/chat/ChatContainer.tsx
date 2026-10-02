import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { AgentArtifactReference } from '@genfeedai/contracts/interfaces';
import { Button } from '@ui/primitives/button';
import Spinner from '@ui/primitives/spinner';
import { MessageSquare, PenLine, Shuffle } from 'lucide-react';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { ChatActionChips } from '~components/chat/ChatActionChips';
import { ChatInput } from '~components/chat/ChatInput';
import { ChatMessage } from '~components/chat/ChatMessage';
import { useChat } from '~hooks/use-chat';
import { usePlatformDetection } from '~hooks/use-platform-detection';
import { useBrandStore } from '~store/use-brand-store';
import { useChatStore } from '~store/use-chat-store';
import { usePlatformStore } from '~store/use-platform-store';

export function ChatContainer({
  mode = 'chat',
  initialContent = '',
  initialUrl = '',
}: {
  mode?: 'chat' | 'reply' | 'remix';
  initialContent?: string;
  initialUrl?: string;
}): ReactElement {
  const messages = useChatStore((s) => s.messages);
  const isGenerating = useChatStore((s) => s.isGenerating);
  const error = useChatStore((s) => s.error);
  const setError = useChatStore((s) => s.setError);
  const brandId = useBrandStore((s) => s.activeBrandId);
  const platform = usePlatformStore((s) => s.currentPlatform);
  const pageContext = usePlatformStore((s) => s.pageContext);
  const { sendMessage } = useChat();
  const endRef = useRef<HTMLDivElement>(null);
  const [suggestedPrompt, setSuggestedPrompt] = useState('');
  usePlatformDetection();
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isGenerating]);
  useEffect(() => {
    setSuggestedPrompt(
      mode === 'reply'
        ? 'Write a reply in my brand voice.'
        : mode === 'remix'
          ? 'Remix this content for my brand.'
          : '',
    );
  }, [mode, initialContent, initialUrl]);
  function handleSend(content: string, references?: AgentArtifactReference[]) {
    const source = initialContent || pageContext?.postContent;
    const url = initialUrl || pageContext?.url;
    const prompt = `${content}${platform ? `\nPlatform: ${platform}.` : ''}${source ? `\nSource content to ${mode === 'remix' ? 'remix' : 'reference'}:\n${source}` : ''}${url ? `\nSource URL: ${url}` : ''}`;
    return sendMessage(prompt, references, content);
  }
  const Icon =
    mode === 'reply' ? MessageSquare : mode === 'remix' ? Shuffle : PenLine;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {error ? (
        <div
          role="alert"
          className="mx-4 mt-3 flex items-center justify-between gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <span>{error}</span>
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.SM}
            onClick={() => setError(null)}
          >
            Dismiss
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col justify-center gap-5 pb-8">
            <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-background-secondary">
              <Icon className="size-5 text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-medium tracking-tight">
                {mode === 'reply'
                  ? 'Join the conversation'
                  : mode === 'remix'
                    ? 'Make it your own'
                    : 'What are we creating?'}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {mode === 'reply'
                  ? 'Draft a reply in your brand voice, with assets from your Library.'
                  : mode === 'remix'
                    ? 'Turn inspiration into something that sounds and looks like your brand.'
                    : 'Write a post, draft a comment, or remix inspiration from the page you’re browsing.'}
              </p>
            </div>
            {initialContent ? (
              <div className="rounded-lg border border-border bg-background-secondary p-3">
                <p className="mb-2 text-2xs font-medium text-muted-foreground">
                  From this page
                </p>
                <p className="line-clamp-4 text-xs leading-5">
                  {initialContent}
                </p>
              </div>
            ) : null}
            <ChatActionChips onChipClick={setSuggestedPrompt} />
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {isGenerating ? (
              <div role="status" className="flex items-center gap-2 py-3">
                <Spinner className="size-4" />
                <span className="text-xs text-muted-foreground">Creating…</span>
              </div>
            ) : null}
            <div ref={endRef} />
          </>
        )}
      </div>
      <div className="shrink-0 px-4 pb-4 pt-2">
        <ChatInput
          key={brandId ?? 'no-brand'}
          onSend={handleSend}
          disabled={isGenerating}
          suggestedPrompt={suggestedPrompt}
        />
      </div>
    </div>
  );
}
