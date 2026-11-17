import { CardPadding, CardVariant } from '@genfeedai/contracts';
import type {
  AgentArtifactReference,
  LibraryAsset,
} from '@genfeedai/contracts/interfaces';
import Card from '@ui/card/Card';
import { Alert } from '@ui/primitives/alert';
import Spinner from '@ui/primitives/spinner';
import { PenLine, Shuffle } from 'lucide-react';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { ChatActionChips } from '~components/chat/ChatActionChips';
import { ChatInput } from '~components/chat/ChatInput';
import { ChatMessage } from '~components/chat/ChatMessage';
import { TextActionPanel } from '~components/chat/TextActionPanel';
import { ReplyPage } from '~components/pages/ReplyPage';
import { useChat } from '~hooks/use-chat';
import { usePlatformDetection } from '~hooks/use-platform-detection';
import { useTextAction } from '~hooks/use-text-action';
import { useBrandStore } from '~store/use-brand-store';
import { useChatStore } from '~store/use-chat-store';
import { usePlatformStore } from '~store/use-platform-store';

export function ChatContainer({
  mode = 'chat',
  initialAuthor = '',
  initialContent = '',
  initialPlatform = '',
  initialReferences,
  initialUrl = '',
}: {
  mode?: 'chat' | 'reply' | 'remix';
  initialAuthor?: string;
  initialContent?: string;
  initialPlatform?: string;
  initialReferences?: readonly LibraryAsset[];
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
  const textAction = useTextAction();
  const endRef = useRef<HTMLDivElement>(null);
  // A chip choice belongs to the source it was picked for: a newly captured
  // source or mode discards it, even when it returns to an earlier value.
  const promptKey = `${mode}\n${initialUrl}\n${initialContent}`;
  const [chosenPrompt, setChosenPrompt] = useState<{
    key: string;
    text: string;
  } | null>(null);
  if (chosenPrompt !== null && chosenPrompt.key !== promptKey) {
    setChosenPrompt(null);
  }
  const suggestedPrompt =
    chosenPrompt?.key === promptKey
      ? chosenPrompt.text
      : mode === 'reply'
        ? 'Write a reply in my brand voice.'
        : mode === 'remix'
          ? 'Remix this content for my brand.'
          : '';
  function setSuggestedPrompt(text: string): void {
    setChosenPrompt({ key: promptKey, text });
  }
  usePlatformDetection();
  // biome-ignore lint/correctness/useExhaustiveDependencies: Message and generation changes must scroll the conversation.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isGenerating]);
  function handleSend(content: string, references?: AgentArtifactReference[]) {
    const source = initialContent || pageContext?.postContent;
    const url = initialUrl || pageContext?.url;
    const prompt = `${content}${platform ? `\nPlatform: ${platform}.` : ''}${source ? `\nSource content to ${mode === 'remix' ? 'remix' : 'reference'}:\n${source}` : ''}${url ? `\nSource URL: ${url}` : ''}`;
    return sendMessage(prompt, references, content);
  }
  const Icon = mode === 'remix' ? Shuffle : PenLine;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {error ? (
        <Alert
          className="mx-4 mt-3"
          closeLabel="Dismiss"
          onClose={() => setError(null)}
          size="sm"
          variant="destructive"
        >
          {error}
        </Alert>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && mode === 'reply' ? (
          <ReplyPage
            initialAuthor={initialAuthor}
            initialContent={initialContent}
            initialPlatform={initialPlatform}
            initialUrl={initialUrl}
          />
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col justify-center gap-5 pb-8">
            <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-card">
              <Icon className="size-5 text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-medium tracking-tight">
                {mode === 'remix'
                  ? 'Make it your own'
                  : 'What are we creating?'}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {mode === 'remix'
                  ? 'Turn inspiration into something that sounds and looks like your brand.'
                  : 'Write a post, draft a comment, or remix inspiration from the page you’re browsing.'}
              </p>
            </div>
            {initialContent ? (
              <Card variant={CardVariant.BORDERED} padding={CardPadding.SM}>
                <p className="mb-2 text-2xs font-medium text-muted-foreground">
                  From this page
                </p>
                <p className="line-clamp-4 text-xs leading-5">
                  {initialContent}
                </p>
              </Card>
            ) : null}
            <ChatActionChips
              onChipClick={setSuggestedPrompt}
              onTextAction={(mode) => {
                void textAction.start(mode);
              }}
            />
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
        <TextActionPanel
          hasActions={messages.length > 0}
          textAction={textAction}
        />
        <ChatInput
          key={brandId ?? 'no-brand'}
          initialAssets={initialReferences}
          onSend={handleSend}
          disabled={isGenerating}
          suggestedPrompt={suggestedPrompt}
        />
      </div>
    </div>
  );
}
