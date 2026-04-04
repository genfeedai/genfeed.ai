export type PostTone =
  | 'professional'
  | 'casual'
  | 'viral'
  | 'educational'
  | 'humorous';

export interface PostGeneratorProps {
  onGenerate: (topic: string, count: number, tone: PostTone) => Promise<void>;
  isGenerating: boolean;
}
