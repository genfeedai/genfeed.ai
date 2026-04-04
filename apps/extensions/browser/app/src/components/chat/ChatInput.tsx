import {
  type KeyboardEvent,
  type ReactElement,
  useCallback,
  useRef,
  useState,
} from 'react';

import { usePlatformStore } from '~store/use-platform-store';

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

const PLATFORM_PLACEHOLDERS: Record<string, string> = {
  facebook: 'Write a post or comment...',
  instagram: 'Write a caption or generate hashtags...',
  linkedin: 'Draft a LinkedIn post or comment...',
  reddit: 'Write a post or comment...',
  tiktok: 'Write a caption or find trending hashtags...',
  twitter: 'Write a tweet, reply, or thread...',
  youtube: 'Write a description or comment...',
};

export function ChatInput({ onSend, disabled }: ChatInputProps): ReactElement {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentPlatform = usePlatformStore((s) => s.currentPlatform);

  const placeholder =
    (currentPlatform && PLATFORM_PLACEHOLDERS[currentPlatform]) ||
    'Type a message...';

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) {
      return;
    }
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, onSend]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput() {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  return (
    <div className="flex items-end gap-2 p-3">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none disabled:opacity-50"
      />
      <button
        type="button"
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        aria-label="Send message"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        <svg
          aria-hidden="true"
          focusable="false"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </div>
  );
}
