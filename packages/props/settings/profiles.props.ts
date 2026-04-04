/**
 * Props and interfaces for profiles settings page
 */

export interface Profile {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  isActive: boolean;
  image?: {
    style: string;
    mood: string[];
    colorPalette?: { primary: string[]; secondary: string[] };
  };
  video?: {
    pacing: string;
    energy: string;
    transitions: string[];
  };
  voice?: {
    pace: string;
    emotion: string;
    personality: string;
  };
  article?: {
    writingStyle: string;
    formality: string;
    vocabulary: string;
  };
  usageCount?: number;
  createdAt: Date;
}
