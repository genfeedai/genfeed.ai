export interface TweetBlockProps {
  index: number;
  text: string;
  onChange: (index: number, text: string) => void;
  onRemove: (index: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  textareaRef: (el: HTMLTextAreaElement | null) => void;
}
