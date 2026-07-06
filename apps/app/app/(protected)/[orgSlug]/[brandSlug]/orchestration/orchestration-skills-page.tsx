'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { APP_ROUTES } from '@genfeedai/constants';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useBrandEnabledSkills } from '@hooks/data/skills/use-brand-enabled-skills';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { type Skill, SkillsService } from '@services/content/skills.service';
import { useRouter } from 'next/navigation';
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
} from 'react';
import SkillCatalogCard from './SkillCatalogCard';
import SkillDetailCard from './SkillDetailCard';
import SkillsPageHeader from './SkillsPageHeader';
import type {
  ModalityFilterValue,
  SourceFilterValue,
  StageFilterValue,
} from './skill-filter-options';

type SkillDraft = {
  defaultInstructions: string;
  description: string;
  name: string;
  systemPromptTemplate: string;
};

function buildSkillTestPrompt(skill: Skill): string {
  return `Use my ${skill.name} setup to create a small sample for ${skill.channels[0] ?? 'this channel'}. Explain how the skill affects the output.`;
}

function emptyDraft(): SkillDraft {
  return {
    defaultInstructions: '',
    description: '',
    name: '',
    systemPromptTemplate: '',
  };
}

function draftFromSkill(skill: Skill | null): SkillDraft {
  return {
    defaultInstructions: skill?.defaultInstructions ?? '',
    description: skill?.description ?? '',
    name: skill?.name ?? '',
    systemPromptTemplate: skill?.systemPromptTemplate ?? '',
  };
}

type PageState = {
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

type PageAction =
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

const initialState: PageState = {
  skills: [],
  selectedSkillId: '',
  sourceFilter: 'all',
  modalityFilter: 'all',
  stageFilter: 'all',
  isLoading: true,
  isSavingSkill: false,
  isCustomizing: false,
  error: null,
  skillDraft: emptyDraft(),
};

function pageReducer(state: PageState, action: PageAction): PageState {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, isLoading: true, error: null };
    case 'LOAD_SUCCESS':
      return { ...state, isLoading: false, skills: action.skills };
    case 'LOAD_ERROR':
      return { ...state, isLoading: false, error: action.message };
    case 'SELECT_SKILL':
      return { ...state, selectedSkillId: action.id, skillDraft: action.draft };
    case 'SET_SOURCE_FILTER':
      return { ...state, sourceFilter: action.value };
    case 'SET_MODALITY_FILTER':
      return { ...state, modalityFilter: action.value };
    case 'SET_STAGE_FILTER':
      return { ...state, stageFilter: action.value };
    case 'SAVE_START':
      return { ...state, isSavingSkill: true, error: null };
    case 'SAVE_SUCCESS':
      return { ...state, isSavingSkill: false };
    case 'SAVE_ERROR':
      return { ...state, isSavingSkill: false, error: action.message };
    case 'CUSTOMIZE_START':
      return { ...state, isCustomizing: true, error: null };
    case 'CUSTOMIZE_SUCCESS':
      return {
        ...state,
        isCustomizing: false,
        selectedSkillId: action.newSkillId,
      };
    case 'CUSTOMIZE_ERROR':
      return { ...state, isCustomizing: false, error: action.message };
    case 'SET_SKILL_DRAFT':
      return { ...state, skillDraft: action.draft };
    default:
      return state;
  }
}

export default function OrchestrationSkillsPage() {
  const { push } = useRouter();
  const { orgHref } = useOrgUrl();
  const { getToken } = useAuthIdentity();
  const { isReady, selectedBrand } = useBrand();

  const { enabledSlugs, toggleSkill } = useBrandEnabledSkills();

  const [state, dispatch] = useReducer(pageReducer, initialState);
  const {
    skills,
    selectedSkillId,
    sourceFilter,
    modalityFilter,
    stageFilter,
    isLoading,
    isSavingSkill,
    isCustomizing,
    error,
    skillDraft,
  } = state;

  const getSkillsService = useCallback(async () => {
    const token = await resolveAuthToken(getToken);
    if (!token) {
      throw new Error('Authentication token unavailable');
    }
    return SkillsService.getInstance(token);
  }, [getToken]);

  const refreshCatalog = useCallback(async () => {
    if (!isReady) {
      return;
    }

    dispatch({ type: 'LOAD_START' });

    try {
      const service = await getSkillsService();
      const catalogSkills = await service.listSkills();

      startTransition(() => {
        dispatch({ type: 'LOAD_SUCCESS', skills: catalogSkills });
      });
    } catch {
      dispatch({
        type: 'LOAD_ERROR',
        message: 'Failed to load the agent skill catalog.',
      });
    }
  }, [getSkillsService, isReady]);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  const filteredSkills = useMemo(() => {
    return skills
      .filter((skill) => {
        const sourceMatches =
          sourceFilter === 'all' || skill.source === sourceFilter;
        const modalityMatches =
          modalityFilter === 'all' ||
          skill.modalities.includes(modalityFilter) ||
          skill.modalities.includes('multi');
        const stageMatches =
          stageFilter === 'all' || skill.workflowStage === stageFilter;

        return sourceMatches && modalityMatches && stageMatches;
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [modalityFilter, skills, sourceFilter, stageFilter]);

  // Derive selectedSkill — falls back to the first filtered skill when the
  // stored id is not in the current filtered list (e.g. after a filter change).
  const selectedSkill = useMemo(
    () =>
      filteredSkills.find((skill) => skill.id === selectedSkillId) ??
      filteredSkills[0] ??
      null,
    [filteredSkills, selectedSkillId],
  );

  // Derive skillDraft from selectedSkill when the user has not yet edited it.
  // This replaces the previous useEffect that synced selectedSkill → skillDraft,
  // and the useEffect that synced selectedSkill.id back to selectedSkillId.
  // Both effects are removed; the draft is computed inline during render.
  const derivedDraft = useMemo(
    () => draftFromSkill(selectedSkill),
    [selectedSkill],
  );

  // When selectedSkill changes (e.g. filters shift the selection), reset the
  // draft to reflect the newly active skill — done inline without an effect.
  const effectiveSkillDraft =
    selectedSkillId === selectedSkill?.id ? skillDraft : derivedDraft;

  const handleSaveSkill = useCallback(async () => {
    if (!selectedSkill?.organization) {
      return;
    }

    dispatch({ type: 'SAVE_START' });

    try {
      const service = await getSkillsService();
      await service.updateSkill(selectedSkill.id, {
        defaultInstructions:
          effectiveSkillDraft.defaultInstructions.trim() || undefined,
        description: effectiveSkillDraft.description.trim(),
        name: effectiveSkillDraft.name.trim(),
        systemPromptTemplate:
          effectiveSkillDraft.systemPromptTemplate.trim() || undefined,
      });
      await refreshCatalog();
      dispatch({ type: 'SAVE_SUCCESS' });
    } catch {
      dispatch({
        type: 'SAVE_ERROR',
        message: 'Failed to update the selected skill variant.',
      });
    }
  }, [
    getSkillsService,
    refreshCatalog,
    selectedSkill,
    effectiveSkillDraft.defaultInstructions,
    effectiveSkillDraft.description,
    effectiveSkillDraft.name,
    effectiveSkillDraft.systemPromptTemplate,
  ]);

  const handleCustomize = useCallback(async () => {
    if (!selectedSkill) {
      return;
    }

    dispatch({ type: 'CUSTOMIZE_START' });

    try {
      const service = await getSkillsService();
      const customizedSkill = await service.customizeSkill(selectedSkill.id, {
        name: `${selectedSkill.name} Custom`,
      });
      await refreshCatalog();
      dispatch({ type: 'CUSTOMIZE_SUCCESS', newSkillId: customizedSkill.id });
    } catch {
      dispatch({
        type: 'CUSTOMIZE_ERROR',
        message: 'Failed to create a brand-editable skill variant.',
      });
    }
  }, [getSkillsService, refreshCatalog, selectedSkill]);

  const handleOpenTestInChat = useCallback(() => {
    if (!selectedSkill) {
      return;
    }

    const prompt = buildSkillTestPrompt(selectedSkill);
    push(
      orgHref(`${APP_ROUTES.AGENT.NEW}?prompt=${encodeURIComponent(prompt)}`),
    );
  }, [orgHref, push, selectedSkill]);

  const handleSkillSelect = useCallback(
    (id: string) => {
      const skill = filteredSkills.find((s) => s.id === id) ?? null;
      dispatch({ type: 'SELECT_SKILL', id, draft: draftFromSkill(skill) });
    },
    [filteredSkills],
  );

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 md:px-6 lg:px-8">
      <SkillsPageHeader
        brandLabel={selectedBrand?.label}
        onRefresh={() => void refreshCatalog()}
        onSourceFilterChange={(value) =>
          dispatch({ type: 'SET_SOURCE_FILTER', value })
        }
        sourceFilter={sourceFilter}
      />

      {error ? (
        <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SkillCatalogCard
          enabledSlugs={enabledSlugs}
          filteredSkills={filteredSkills}
          isLoading={isLoading}
          modalityFilter={modalityFilter}
          onModalityFilterChange={(value) =>
            dispatch({ type: 'SET_MODALITY_FILTER', value })
          }
          onSkillSelect={handleSkillSelect}
          onStageFilterChange={(value) =>
            dispatch({ type: 'SET_STAGE_FILTER', value })
          }
          onToggleSkill={(slug) => void toggleSkill(slug)}
          selectedSkillId={selectedSkill?.id}
          stageFilter={stageFilter}
        />

        <SkillDetailCard
          customizing={isCustomizing}
          onCustomize={() => void handleCustomize()}
          onOpenTestInChat={handleOpenTestInChat}
          onSaveSkill={() => void handleSaveSkill()}
          onSkillDraftChange={(updater) =>
            dispatch({
              type: 'SET_SKILL_DRAFT',
              draft: updater(effectiveSkillDraft),
            })
          }
          savingSkill={isSavingSkill}
          selectedSkill={selectedSkill}
          skillDraft={effectiveSkillDraft}
        />
      </div>
    </div>
  );
}
