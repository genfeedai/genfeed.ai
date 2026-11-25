import { EMPTY_PAGE_TOTALS } from '@genfeedai/contracts/constants';
import type { Skill } from '@services/content/skills.service';
import type {
  SkillsPageAction as PageAction,
  SkillsPageState as PageState,
  SkillDraft,
  SkillVersionsState,
} from '@/features/settings/props/skills.props';

export function emptyDraft(): SkillDraft {
  return {
    defaultInstructions: '',
    description: '',
    name: '',
    systemPromptTemplate: '',
  };
}

export function draftFromSkill(skill: Skill | null): SkillDraft {
  return {
    defaultInstructions: skill?.defaultInstructions ?? '',
    description: skill?.description ?? '',
    name: skill?.name ?? '',
    systemPromptTemplate: skill?.systemPromptTemplate ?? '',
  };
}

export function emptyVersions(): SkillVersionsState {
  return {
    skillId: '',
    items: [],
    detail: null,
    hasLoaded: false,
    hasMore: false,
    nextCursor: null,
    isLoading: false,
    error: null,
  };
}

export const initialState: PageState = {
  versions: emptyVersions(),
  importFields: { files: [], slug: '', sourceUrl: '', checksum: '' },
  isImportOpen: false,
  isImporting: false,
  isImportLocked: false,
  importError: null,
  importResetKey: 0,
  error: null,
  isCustomizing: false,
  isLoading: true,
  isSavingSkill: false,
  modalityFilter: 'all',
  runsOnFilter: 'all',
  searchQuery: '',
  selectedSkillId: '',
  skillDraft: emptyDraft(),
  originalSkillDraft: emptyDraft(),
  forkCreatedForSkillId: '',
  skills: [],
  pageTotals: EMPTY_PAGE_TOTALS,
  sourceFilter: 'all',
  stageFilter: 'all',
};

export function pageReducer(state: PageState, action: PageAction): PageState {
  switch (action.type) {
    case 'VERSIONS_CLEAR':
      return { ...state, versions: emptyVersions() };
    case 'VERSIONS_START':
      return {
        ...state,
        versions: {
          ...state.versions,
          skillId: action.skillId,
          detail: null,
          isLoading: true,
          error: null,
        },
      };
    case 'VERSIONS_LIST':
      return {
        ...state,
        versions: {
          skillId: action.skillId,
          items: action.items,
          detail: null,
          isLoading: false,
          hasLoaded: true,
          hasMore: action.hasMore,
          nextCursor: action.nextCursor,
          error: null,
        },
      };
    case 'VERSIONS_DETAIL':
      return {
        ...state,
        versions: {
          ...state.versions,
          skillId: action.skillId,
          detail: action.detail,
          isLoading: false,
          error: null,
        },
      };
    case 'VERSIONS_ERROR':
      return {
        ...state,
        versions: { ...emptyVersions(), error: action.message },
      };
    case 'RESET':
      return {
        ...initialState,
        isImportLocked: action.importLocked ?? false,
        importResetKey: state.importResetKey + 1,
      };
    case 'IMPORT_RECOVERED':
      return { ...state, isImportLocked: false, importError: null };
    case 'IMPORT_OPEN':
      return { ...state, isImportOpen: true, importError: null };
    case 'IMPORT_FIELDS':
      return {
        ...state,
        importFields: { ...state.importFields, ...action.fields },
        importError: null,
      };
    case 'IMPORT_START':
      return { ...state, isImporting: true, importError: null };
    case 'IMPORT_SENT':
      return { ...state, isImportLocked: true };
    case 'IMPORT_DONE':
      return {
        ...state,
        isImporting: false,
        isImportLocked: true,
        isImportOpen: false,
        importError: null,
        importFields: initialState.importFields,
        importResetKey: state.importResetKey + 1,
      };
    case 'IMPORT_ERROR':
      return {
        ...state,
        isImporting: false,
        isImportLocked: action.locked,
        importError: action.message,
      };
    case 'FORK_CREATED':
      return { ...state, forkCreatedForSkillId: action.sourceId };
    case 'HYDRATE_SKILL':
      return {
        ...state,
        versions: emptyVersions(),
        error: null,
        isSavingSkill: false,
        isCustomizing: false,
        selectedSkillId: action.skill.id,
        skillDraft: draftFromSkill(action.skill),
        originalSkillDraft: draftFromSkill(action.skill),
        skills: [
          ...state.skills.filter((skill) => skill.id !== action.skill.id),
          action.skill,
        ],
      };
    case 'LOAD_START':
      return {
        ...state,
        error: null,
        isLoading: true,
        skills: [],
        pageTotals: EMPTY_PAGE_TOTALS,
      };
    case 'LOAD_SUCCESS':
      return {
        ...state,
        isLoading: false,
        skills: action.page.items,
        pageTotals: {
          totalDocs: action.page.total,
          totalPages: action.page.totalPages,
        },
      };
    case 'LOAD_ERROR':
      return {
        ...state,
        error: action.message,
        isLoading: false,
        selectedSkillId: '',
        skillDraft: emptyDraft(),
        skills: [],
        pageTotals: EMPTY_PAGE_TOTALS,
      };
    case 'SELECT_SKILL':
      return {
        ...state,
        versions: emptyVersions(),
        isImportOpen: false,
        isImporting: false,
        selectedSkillId: action.id,
        skillDraft: action.draft,
        originalSkillDraft: action.draft,
        error: null,
        isCustomizing: false,
        isSavingSkill: false,
      };
    case 'CLEAR_SELECTED_SKILL':
      return {
        ...state,
        versions: emptyVersions(),
        selectedSkillId: '',
        skillDraft: emptyDraft(),
        originalSkillDraft: emptyDraft(),
        error: null,
        isCustomizing: false,
        isSavingSkill: false,
      };
    case 'SET_SOURCE_FILTER':
      return { ...state, sourceFilter: action.value };
    case 'SET_MODALITY_FILTER':
      return { ...state, modalityFilter: action.value };
    case 'SET_RUNS_ON_FILTER':
      return { ...state, runsOnFilter: action.value };
    case 'SET_STAGE_FILTER':
      return { ...state, stageFilter: action.value };
    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.value };
    case 'SAVE_START':
      return { ...state, error: null, isSavingSkill: true };
    case 'SAVE_SUCCESS':
      return { ...state, isSavingSkill: false };
    case 'SAVE_ERROR':
      return { ...state, error: action.message, isSavingSkill: false };
    case 'CUSTOMIZE_START':
      return { ...state, error: null, isCustomizing: true };
    case 'CUSTOMIZE_ERROR':
      return { ...state, error: action.message, isCustomizing: false };
    case 'SET_SKILL_DRAFT':
      return { ...state, skillDraft: action.draft };
    default:
      return state;
  }
}
