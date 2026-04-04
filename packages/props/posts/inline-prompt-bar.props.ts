export interface InlinePromptBarProps {
  postId: string;
  onEnhance: (postId: string, prompt: string) => Promise<void>;
  isEnhancing: boolean;
  placeholder?: string;
  className?: string;
}
