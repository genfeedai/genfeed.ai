import type {
  ModalityFilterValue,
  SourceFilterValue,
  StageFilterValue,
} from '@props/settings/skill-filters.props';
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

export type SkillCatalogCardProps = {
  enabledSlugs: string[];
  filteredSkills: Skill[];
  isLoading: boolean;
  isTogglingSkill: boolean;
  modalityFilter: ModalityFilterValue;
  onModalityFilterChange: (value: ModalityFilterValue) => void;
  onSkillSelect: (id: string) => void;
  onStageFilterChange: (value: StageFilterValue) => void;
  onToggleSkill: (slug: string) => void;
  selectedSkillId: string | undefined;
  stageFilter: StageFilterValue;
};

export type SkillsPageHeaderProps = {
  agentHref: string;
  brandLabel: string | undefined;
  onRefresh: () => void;
  onSourceFilterChange: (value: SourceFilterValue) => void;
  sourceFilter: SourceFilterValue;
};

export type SkillsPageState = {
  skills: Skill[];
  selectedSkillId: string;
  sourceFilter: SourceFilterValue;
  modalityFilter: ModalityFilterValue;
  stageFilter: StageFilterValue;
  isLoading: boolean;
  isSavingSkill: boolean;
  isCustomizing: boolean;
  error: string | null;
  skillDraft: SkillDraft;
};

export type SkillsPageAction =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; skills: Skill[] }
  | { type: 'LOAD_ERROR'; message: string }
  | { type: 'SELECT_SKILL'; id: string; draft: SkillDraft }
  | { type: 'SET_SOURCE_FILTER'; value: SourceFilterValue }
  | { type: 'SET_MODALITY_FILTER'; value: ModalityFilterValue }
  | { type: 'SET_STAGE_FILTER'; value: StageFilterValue }
  | { type: 'SAVE_START' }
  | { type: 'SAVE_SUCCESS' }
  | { type: 'SAVE_ERROR'; message: string }
  | { type: 'CUSTOMIZE_START' }
  | { type: 'CUSTOMIZE_SUCCESS'; newSkillId: string }
  | { type: 'CUSTOMIZE_ERROR'; message: string }
  | { type: 'SET_SKILL_DRAFT'; draft: SkillDraft };
