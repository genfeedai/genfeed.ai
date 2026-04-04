export interface IToneProfile {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  isDefault: boolean;
  image: IImageTone;
  video: IVideoTone;
  voice: IVoiceTone;
  article: IArticleTone;
  brandGuidelines: IBrandGuidelines;
  examples: IToneExample[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IImageTone {
  style: ImageStyle;
  mood: ImageMood[];
  colorPalette: IColorPalette;
  composition: CompositionStyle[];
  lighting: LightingStyle;
  filters: string[];
  avoidPatterns: string[];
  keywords: string[];
  referenceImages?: string[];
}

export type ImageStyle =
  | 'photorealistic'
  | 'cinematic'
  | 'minimalist'
  | 'vibrant'
  | 'moody'
  | 'flat-design'
  | 'illustration'
  | '3d-render'
  | 'abstract'
  | 'vintage'
  | 'modern'
  | 'corporate'
  | 'playful';

export type ImageMood =
  | 'professional'
  | 'energetic'
  | 'calm'
  | 'luxurious'
  | 'friendly'
  | 'bold'
  | 'elegant'
  | 'fun'
  | 'serious'
  | 'inspirational';

export interface IColorPalette {
  primary: string[];
  secondary: string[];
  accent: string[];
  neutral: string[];
  avoid: string[];
  dominance?: 'warm' | 'cool' | 'neutral' | 'vibrant' | 'muted';
}

export type CompositionStyle =
  | 'centered'
  | 'rule-of-thirds'
  | 'symmetrical'
  | 'dynamic'
  | 'leading-lines'
  | 'minimalist'
  | 'layered';

export type LightingStyle =
  | 'natural'
  | 'studio'
  | 'dramatic'
  | 'soft'
  | 'backlit'
  | 'golden-hour'
  | 'high-key'
  | 'low-key';

export interface IVideoTone {
  pacing: VideoPacing;
  energy: VideoEnergy;
  transitions: TransitionStyle[];
  musicStyle: MusicStyle[];
  voiceoverStyle?: VoiceoverStyle;
  textStyle: ITextStyle;
  sceneLength: { min: number; max: number };
  colorGrading: ColorGrading;
  aspectRatio: AspectRatio[];
  effects: VideoEffect[];
  keywords: string[];
}

export type VideoPacing = 'fast' | 'moderate' | 'slow' | 'dynamic';

export type VideoEnergy = 'high' | 'medium' | 'low' | 'varied';

export type TransitionStyle =
  | 'cut'
  | 'fade'
  | 'wipe'
  | 'zoom'
  | 'slide'
  | 'dissolve';

export type MusicStyle =
  | 'upbeat'
  | 'corporate'
  | 'cinematic'
  | 'ambient'
  | 'electronic'
  | 'acoustic'
  | 'dramatic'
  | 'none';

export type VoiceoverStyle =
  | 'professional'
  | 'conversational'
  | 'authoritative'
  | 'friendly'
  | 'energetic'
  | 'calm'
  | 'none';

export interface ITextStyle {
  font: string;
  size: 'small' | 'medium' | 'large';
  weight: 'light' | 'regular' | 'bold';
  color: string;
  animation: TextAnimation[];
  placement: TextPlacement[];
}

export type TextAnimation =
  | 'fade-in'
  | 'slide-in'
  | 'typewriter'
  | 'scale'
  | 'none';

export type TextPlacement =
  | 'top'
  | 'center'
  | 'bottom'
  | 'lower-third'
  | 'corner';

export type ColorGrading =
  | 'natural'
  | 'warm'
  | 'cool'
  | 'cinematic'
  | 'vibrant'
  | 'muted'
  | 'high-contrast'
  | 'vintage';

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5';

export type VideoEffect =
  | 'none'
  | 'vignette'
  | 'blur-background'
  | 'motion-blur'
  | 'slow-motion'
  | 'time-lapse'
  | 'parallax';

export interface IVoiceTone {
  personality: VoicePersonality;
  pace: VoicePace;
  pitch: VoicePitch;
  emotion: VoiceEmotion[];
  language: string;
  accent?: string;
  speakingStyle: SpeakingStyle;
  emphasis: EmphasisPattern[];
  pauses: PausePattern;
  preferredVoiceIds?: string[];
  keywords: string[];
}

export type VoicePersonality =
  | 'professional'
  | 'friendly'
  | 'authoritative'
  | 'casual'
  | 'enthusiastic'
  | 'calm'
  | 'confident'
  | 'warm';

export type VoicePace = 'fast' | 'moderate' | 'slow';

export type VoicePitch = 'low' | 'medium' | 'high' | 'varied';

export type VoiceEmotion =
  | 'neutral'
  | 'excited'
  | 'serious'
  | 'empathetic'
  | 'humorous'
  | 'inspirational';

export type SpeakingStyle =
  | 'conversational'
  | 'presentational'
  | 'storytelling'
  | 'instructional'
  | 'motivational';

export type EmphasisPattern = 'keywords' | 'questions' | 'numbers' | 'none';

export type PausePattern = 'natural' | 'dramatic' | 'minimal';

export interface IArticleTone {
  writingStyle: WritingStyle;
  formality: FormalityLevel;
  perspective: Perspective;
  sentenceStructure: SentenceStructure;
  vocabulary: VocabularyLevel;
  humor: HumorLevel;
  storytelling: StorytellingApproach;
  callToAction: CTAStyle;
  readingLevel: ReadingLevel;
  structurePreferences: IArticleStructure;
  keywords: string[];
  avoidWords: string[];
}

export type WritingStyle =
  | 'professional'
  | 'casual'
  | 'academic'
  | 'journalistic'
  | 'creative'
  | 'technical'
  | 'conversational'
  | 'persuasive';

export type FormalityLevel =
  | 'very-formal'
  | 'formal'
  | 'neutral'
  | 'informal'
  | 'very-informal';

export type Perspective = 'first-person' | 'second-person' | 'third-person';

export type SentenceStructure = 'short' | 'medium' | 'long' | 'varied';

export type VocabularyLevel = 'simple' | 'moderate' | 'advanced' | 'expert';

export type HumorLevel = 'none' | 'subtle' | 'moderate' | 'frequent';

export type StorytellingApproach =
  | 'none'
  | 'anecdotes'
  | 'narrative'
  | 'case-studies';

export type CTAStyle = 'strong' | 'moderate' | 'soft' | 'none';

export type ReadingLevel =
  | 'elementary'
  | 'middle-school'
  | 'high-school'
  | 'college'
  | 'expert';

export interface IArticleStructure {
  useHeadings: boolean;
  useBulletPoints: boolean;
  useNumberedLists: boolean;
  useBlockquotes: boolean;
  paragraphLength: 'short' | 'medium' | 'long';
  includeIntro: boolean;
  includeConclusion: boolean;
  sectionBreaks: boolean;
}

export interface IBrandGuidelines {
  mission: string;
  values: string[];
  targetAudience: string[];
  brandPersonality: string[];
  dosList: string[];
  dontsList: string[];
  competitorDifferentiation: string[];
  keyMessages: string[];
}

export interface IToneExample {
  type: 'good' | 'bad';
  contentType: 'image' | 'video' | 'voice' | 'article';
  content: string;
  explanation: string;
}

export interface IToneAnalysis {
  score: number;
  matches: {
    image?: number;
    video?: number;
    voice?: number;
    article?: number;
  };
  violations: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high';
    message: string;
    suggestion: string;
  }>;
  suggestions: string[];
}

export interface IApplyToneRequest {
  prompt: string;
  contentType: 'image' | 'video' | 'voice' | 'article';
  toneProfileId?: string;
  customizations?: Partial<IToneProfile>;
}

export interface IApplyToneResult {
  originalPrompt: string;
  enhancedPrompt: string;
  appliedTone: {
    image?: Partial<IImageTone>;
    video?: Partial<IVideoTone>;
    voice?: Partial<IVoiceTone>;
    article?: Partial<IArticleTone>;
  };
  improvements: string[];
  estimatedConsistency: number;
}
