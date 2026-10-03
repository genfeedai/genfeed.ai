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

export type SkillDraftError = { field: keyof SkillDraft; maximum: number };
export type SkillDraftPatchResult = {
  patch: Partial<SkillDraft>;
  errors: SkillDraftError[];
  hasChanges: boolean;
};

export type SkillDetailCardProps = {
  draftErrors: SkillDraftError[];
  hasChanges: boolean;
  isForkBlocked?: boolean;
  customizing: boolean;
  onCustomize: () => void;
  onSaveSkill: () => void;
  onSkillDraftChange: (updater: (current: SkillDraft) => SkillDraft) => void;
  savingSkill: boolean;
  selectedSkill: Skill | null;
  skillDraft: SkillDraft;
};

export type SkillDetailSheetProps = SkillDetailCardProps & {
  error?: string | null;
  onArchiveSkill?: () => void;
  onClose: () => void;
  onExportSkill?: () => void;
  onOpenSamplePrompt: () => void;
};

export type SkillImportFields = {
  files: File[];
  slug: string;
  sourceUrl: string;
  checksum: string;
};

export type SkillsPageState = {
  importFields: SkillImportFields;
  isImportOpen: boolean;
  isImporting: boolean;
  isImportLocked: boolean;
  importError: string | null;
  importResetKey: number;
  skills: Skill[];
  selectedSkillId: string;
  sourceFilter: SourceFilterValue;
  modalityFilter: ModalityFilterValue;
  stageFilter: StageFilterValue;
  searchQuery: string;
  isLoading: boolean;
  isSavingSkill: boolean;
  isCustomizing: boolean;
  error: string | null;
  skillDraft: SkillDraft;
  originalSkillDraft: SkillDraft;
  forkCreatedForSkillId: string;
};

export type SkillsPageAction =
  | { type: 'RESET'; importLocked?: boolean }
  | { type: 'IMPORT_RECOVERED' }
  | { type: 'IMPORT_OPEN' }
  | { type: 'IMPORT_FIELDS'; fields: Partial<SkillImportFields> }
  | { type: 'IMPORT_START' }
  | { type: 'IMPORT_SENT' }
  | { type: 'IMPORT_DONE' }
  | { type: 'IMPORT_ERROR'; message: string; locked: boolean }
  | { type: 'HYDRATE_SKILL'; skill: Skill }
  | { type: 'FORK_CREATED'; sourceId: string }
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; skills: Skill[] }
  | { type: 'LOAD_ERROR'; message: string }
  | { type: 'SELECT_SKILL'; id: string; draft: SkillDraft }
  | { type: 'CLEAR_SELECTED_SKILL' }
  | { type: 'SET_SOURCE_FILTER'; value: SourceFilterValue }
  | { type: 'SET_MODALITY_FILTER'; value: ModalityFilterValue }
  | { type: 'SET_STAGE_FILTER'; value: StageFilterValue }
  | { type: 'SET_SEARCH_QUERY'; value: string }
  | { type: 'SAVE_START' }
  | { type: 'SAVE_SUCCESS' }
  | { type: 'SAVE_ERROR'; message: string }
  | { type: 'CUSTOMIZE_START' }
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
  pendingSlugs: ReadonlySet<string>;
  onSkillSelect: (id: string) => void;
  onToggleSkill: (slug: string) => void;
  skills: Skill[];
};

export type SkillImportInputErrorCode =
  | 'SLUG'
  | 'SOURCE_URL'
  | 'CHECKSUM'
  | 'COUNT'
  | 'PATH'
  | 'DIRECTORY'
  | 'ROOT'
  | 'SIZE'
  | 'UTF8'
  | 'READ';

export interface SkillImportInputOptions {
  slug: string;
  sourceUrl?: string;
  checksum?: string;
}
export interface SkillImportInputFile {
  content: string;
  path: string;
}
export interface SkillImportInput {
  slug: string;
  sourceUrl?: string;
  expectedPackageChecksum?: string;
  package:
    | { format: 'files'; files: SkillImportInputFile[] }
    | { format: 'zip'; archiveBase64: string };
}

export interface SkillImportFormLabels {
  files: string;
  slug: string;
  sourceUrl: string;
  checksum: string;
  submit: string;
  submitting: string;
  selectedFiles: string;
  packageHint: string;
  nestedHint: string;
  failed: string;
  errors: Record<SkillImportInputErrorCode, string>;
}
export interface SkillImportFormProps {
  files: readonly File[];
  slug: string;
  sourceUrl: string;
  checksum: string;
  onFilesChange: (files: File[]) => void;
  onSlugChange: (value: string) => void;
  onSourceUrlChange: (value: string) => void;
  onChecksumChange: (value: string) => void;
  onImport: (input: SkillImportInput) => Promise<void>;
  labels: SkillImportFormLabels;
  isDisabled: boolean;
  isSubmitting: boolean;
  /** Parent must include current auth/organization identity, not just the selected brand. */
  scopeKey: string;
  resetKey?: string | number;
  error?: string;
}
