export interface IllustrationPromptSectionProps {
  formatLabel: string;
  /** A generated image is waiting; "Try Again" must clear it before re-running. */
  hasGeneratedImage: boolean;
  isGenerating: boolean;
  onGenerate: () => void;
  onPromptChange: (prompt: string) => void;
  prompt: string;
}
