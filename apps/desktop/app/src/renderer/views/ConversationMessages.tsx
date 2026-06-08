import type {
  IDesktopContentRunDraft,
  IDesktopThread,
} from '@genfeedai/desktop-contracts';

import { MessageBubble } from './ConversationMessageBubble';

interface ConversationMessagesProps {
  isGenerating: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onPublishGeneratedContent: () => Promise<void>;
  selectedDraft: IDesktopContentRunDraft | null;
  thread: IDesktopThread | null;
}

export default function ConversationMessages({
  isGenerating,
  messagesEndRef,
  onPublishGeneratedContent,
  selectedDraft,
  thread,
}: ConversationMessagesProps) {
  return (
    <>
      {(!thread || thread.messages.length === 0) && !isGenerating && (
        <div className="conversation-empty">
          <div className="empty-logo">G</div>
          <h3>What do you want to create?</h3>
          <p className="muted-text">
            Choose a platform, set the output type, save a draft, and run the
            loop from prompt to publish.
          </p>
        </div>
      )}

      {thread?.messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          onPublishGeneratedContent={
            message.generatedContent ? onPublishGeneratedContent : undefined
          }
          publishResult={selectedDraft?.publishResult}
        />
      ))}

      {isGenerating && (
        <div className="message-row message-ai">
          <div className="message-avatar">G</div>
          <div className="message-bubble bubble-ai typing-indicator">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </>
  );
}
