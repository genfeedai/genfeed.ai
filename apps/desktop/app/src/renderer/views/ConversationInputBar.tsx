import type { DesktopContentPlatform } from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import type { KeyboardEvent, RefObject } from 'react';

const PLATFORM_DESCRIPTIONS: Record<DesktopContentPlatform, string> = {
  twitter: 'Fast hooks and threads',
  tiktok: 'Short-form scripts',
  instagram: 'Captions and carousels',
  linkedin: 'Founder and GTM posts',
  youtube: 'Long-form video angles',
};

type ConversationInputBarProps = {
  input: string;
  isGenerating: boolean;
  onInputChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  platform: DesktopContentPlatform;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  workspaceId: string | null;
};

export function ConversationInputBar({
  input,
  isGenerating,
  onInputChange,
  onKeyDown,
  onSend,
  platform,
  textareaRef,
  workspaceId,
}: ConversationInputBarProps) {
  return (
    <div className="conversation-input-bar">
      <Textarea
        className="conversation-input"
        onChange={(event) => onInputChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Describe the content run you want to execute… (⌘+Enter to send)"
        ref={textareaRef}
        rows={3}
        value={input}
      />
      <div className="conversation-input-actions">
        <span className="muted-text">
          {PLATFORM_DESCRIPTIONS[platform] ?? 'Content generation'}
        </span>
        <Button
          className="send-button"
          disabled={!input.trim() || isGenerating || !workspaceId}
          onClick={onSend}
          type="button"
          variant={ButtonVariant.DEFAULT}
        >
          {isGenerating ? 'Generating…' : 'Generate'}
        </Button>
      </div>
    </div>
  );
}
