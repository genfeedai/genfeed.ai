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

export type SkillsPageState = {
  skills: Skill[];
  selectedSkillId: string;
  sourceFilter: SourceFilterValue;
  modalityFilter: ModalityFilterValue;
  stageFilter: StageFilterValue;
  searchQuery: string;
  isLoading: boolean;
  isSavingSkill: boolean;
  isCustomizing: boolean;
  isDetailSheetOpen: boolean;
  error: string | null;
  skillDraft: SkillDraft;
};

export type SkillsPageAction =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; skills: Skill[] }
  | { type: 'LOAD_ERROR'; message: string }
  | { type: 'SELECT_SKILL'; id: string; draft: SkillDraft }
  | { type: 'CLOSE_DETAIL_SHEET' }
  | { type: 'SET_SOURCE_FILTER'; value: SourceFilterValue }
  | { type: 'SET_MODALITY_FILTER'; value: ModalityFilterValue }
  | { type: 'SET_STAGE_FILTER'; value: StageFilterValue }
  | { type: 'SET_SEARCH_QUERY'; value: string }
  | { type: 'SAVE_START' }
  | { type: 'SAVE_SUCCESS' }
  | { type: 'SAVE_ERROR'; message: string }
  | { type: 'CUSTOMIZE_START' }
  | { type: 'CUSTOMIZE_SUCCESS'; newSkillId: string }
  | { type: 'CUSTOMIZE_ERROR'; message: string }
  | { type: 'SET_SKILL_DRAFT'; draft: SkillDraft };

export type SkillFiltersProps = {
  agentHref: string;
  modalityFilter: ModalityFilterValue;
  onModalityFilterChange: (value: ModalityFilterValue) => void;
  onRefresh: () => void;
  onSearchQueryChange: (value: string) => void;
  onSourceFilterChange: (value: SourceFilterValue) => void;
  onStageFilterChange: (value: StageFilterValue) => void;
  searchQuery: string;
  sourceFilter: SourceFilterValue;
  stageFilter: StageFilterValue;
};

export type SkillsTableProps = {
  enabledSlugs: string[];
  isLoading: boolean;
  isTogglingSkill: boolean;
  onSkillSelect: (id: string) => void;
  onToggleSkill: (slug: string) => void;
  skills: Skill[];
};

export type SkillDetailSheetProps = Props & {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};
