import type {
  IDesktopContentRunBrief,
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

function BriefHandoffCard({ brief }: { brief: IDesktopContentRunBrief }) {
  return (
    <div className="brief-handoff-card">
      <div className="brief-handoff-header">
        <span className="status-badge status-active">Brief</span>
        {typeof brief.confidence === 'number' && (
          <span className="muted-text">
            Confidence {String(Math.round(brief.confidence * 100))}%
          </span>
        )}
      </div>
      <h3>{brief.angle ?? 'Trend brief'}</h3>
      {brief.hypothesis && <p>{brief.hypothesis}</p>}
      {brief.channelFit && (
        <p className="muted-text">Channel fit: {brief.channelFit}</p>
      )}
      {brief.evidence && brief.evidence.length > 0 && (
        <ul className="brief-evidence-list">
          {brief.evidence.map((item, index) => (
            <li key={`${item}-${String(index)}`}>{item}</li>
          ))}
        </ul>
      )}
      {brief.risk && <p className="muted-text">Guardrail: {brief.risk}</p>}
    </div>
  );
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
      {selectedDraft?.brief && <BriefHandoffCard brief={selectedDraft.brief} />}

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
