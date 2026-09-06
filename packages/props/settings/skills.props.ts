import type { Skill } from '@services/content/skills.service';

export type SkillDraft = {
  defaultInstructions: string;
  description: string;
  name: string;
  systemPromptTemplate: string;
};

export type Props = {
  customizing: boolean;
  onCustomize: () => void;
  onOpenTestInChat: () => void;
  onSaveSkill: () => void;
  onSkillDraftChange: (updater: (current: SkillDraft) => SkillDraft) => void;
  savingSkill: boolean;
  selectedSkill: Skill | null;
  skillDraft: SkillDraft;
};
