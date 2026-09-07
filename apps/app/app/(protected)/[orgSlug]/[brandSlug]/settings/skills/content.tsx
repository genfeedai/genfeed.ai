'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { getBrandOrganizationSlug } from '@contexts/user/brand-context/brand-context.helpers';
import { ModalEnum } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  closeModal,
  openModal,
} from '@genfeedai/helpers/ui/modal/modal.helper';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useBrandEnabledSkills } from '@hooks/data/skills/use-brand-enabled-skills';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type {
  SkillsPageAction as PageAction,
  SkillsPageState as PageState,
  SkillDraft,
} from '@props/settings/skills.props';
import { type Skill, SkillsService } from '@services/content/skills.service';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import SkillDetailSheet from './skill-detail-sheet';
import SkillFilters from './skill-filters';
import SkillsTable from './skills-table';

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

const initialState: PageState = {
  error: null,
  isCustomizing: false,
  isLoading: true,
  isSavingSkill: false,
  modalityFilter: 'all',
  searchQuery: '',
  selectedSkillId: '',
  skillDraft: emptyDraft(),
  skills: [],
  sourceFilter: 'all',
  stageFilter: 'all',
};

function pageReducer(state: PageState, action: PageAction): PageState {
  switch (action.type) {
    case 'LOAD_START':
      return {
        ...state,
        error: null,
        isLoading: true,
        skills: [],
      };
    case 'LOAD_SUCCESS':
      return { ...state, isLoading: false, skills: action.skills };
    case 'LOAD_ERROR':
      return {
        ...state,
        error: action.message,
        isLoading: false,
        selectedSkillId: '',
        skillDraft: emptyDraft(),
        skills: [],
      };
    case 'SELECT_SKILL':
      return {
        ...state,
        selectedSkillId: action.id,
        skillDraft: action.draft,
      };
    case 'CLEAR_SELECTED_SKILL':
      return { ...state, selectedSkillId: '', skillDraft: emptyDraft() };
    case 'SET_SOURCE_FILTER':
      return { ...state, sourceFilter: action.value };
    case 'SET_MODALITY_FILTER':
      return { ...state, modalityFilter: action.value };
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
    case 'CUSTOMIZE_SUCCESS':
      return {
        ...state,
        isCustomizing: false,
        selectedSkillId: action.newSkillId,
      };
    case 'CUSTOMIZE_ERROR':
      return { ...state, error: action.message, isCustomizing: false };
    case 'SET_SKILL_DRAFT':
      return { ...state, skillDraft: action.draft };
    default:
      return state;
  }
}

export default function BrandSettingsSkillsPage() {
  const translate = useTranslations('common.settings.skills');
  const params = useParams<{ brandSlug: string; orgSlug: string }>();
  const { push } = useRouter();
  const { href } = useOrgUrl();
  const { getToken } = useAuthIdentity();
  const { brandId, isReady, selectedBrand } = useBrand();

  const {
    enabledSlugs,
    isLoading: isTogglingSkill,
    toggleSkill,
  } = useBrandEnabledSkills();
  const catalogRequestIdRef = useRef(0);

  const [state, dispatch] = useReducer(pageReducer, initialState);
  const {
    error,
    isCustomizing,
    isLoading,
    isSavingSkill,
    modalityFilter,
    searchQuery,
    selectedSkillId,
    skillDraft,
    skills,
    sourceFilter,
    stageFilter,
  } = state;

  const isScopeMatch = Boolean(
    brandId &&
      selectedBrand?.id === brandId &&
      selectedBrand.slug === params.brandSlug &&
      getBrandOrganizationSlug(selectedBrand) === params.orgSlug,
  );

  const getSkillsService = useCallback(async () => {
    const token = await resolveAuthToken(getToken);
    if (!token) {
      throw new Error(translate('errors.authenticationUnavailable'));
    }
    return SkillsService.getInstance(token);
  }, [getToken, translate]);

  const refreshCatalog = useCallback(async () => {
    const requestId = ++catalogRequestIdRef.current;

    if (!brandId || !isReady || !isScopeMatch) {
      return;
    }

    dispatch({ type: 'LOAD_START' });

    try {
      const service = await getSkillsService();
      const catalogSkills = await service.listSkills();

      if (requestId !== catalogRequestIdRef.current) {
        return;
      }

      startTransition(() => {
        dispatch({ type: 'LOAD_SUCCESS', skills: catalogSkills });
      });
    } catch {
      if (requestId !== catalogRequestIdRef.current) {
        return;
      }

      closeModal(ModalEnum.SKILL);
      dispatch({
        type: 'LOAD_ERROR',
        message: translate('errors.loadFailed'),
      });
    }
  }, [brandId, getSkillsService, isReady, isScopeMatch, translate]);

  useEffect(() => {
    void refreshCatalog();

    return () => {
      catalogRequestIdRef.current += 1;
    };
  }, [refreshCatalog]);

  const filteredSkills = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

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
        const searchMatches =
          normalizedQuery.length === 0 ||
          skill.name.toLowerCase().includes(normalizedQuery) ||
          skill.description.toLowerCase().includes(normalizedQuery);

        return (
          sourceMatches && modalityMatches && stageMatches && searchMatches
        );
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [modalityFilter, searchQuery, skills, sourceFilter, stageFilter]);

  // Derive selectedSkill from the full catalog (not the filtered list) so the
  // open detail sheet keeps showing its skill even if a filter change would
  // otherwise exclude it from the table.
  const selectedSkill = useMemo(
    () => skills.find((skill) => skill.id === selectedSkillId) ?? null,
    [selectedSkillId, skills],
  );

  // Derive skillDraft from selectedSkill when the user has not yet edited it.
  const derivedDraft = useMemo(
    () => draftFromSkill(selectedSkill),
    [selectedSkill],
  );

  const effectiveSkillDraft =
    selectedSkillId === selectedSkill?.id ? skillDraft : derivedDraft;

  const handleSaveSkill = useCallback(async () => {
    if (!isScopeMatch || !selectedSkill?.organization) {
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
        message: translate('errors.updateFailed'),
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
    isScopeMatch,
    translate,
  ]);

  const handleCustomize = useCallback(async () => {
    if (!isScopeMatch || !selectedSkill) {
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
        message: translate('errors.customizeFailed'),
      });
    }
  }, [
    getSkillsService,
    isScopeMatch,
    refreshCatalog,
    selectedSkill,
    translate,
  ]);

  const handleOpenTestInChat = useCallback(() => {
    if (!selectedSkill) {
      return;
    }

    const prompt = translate('testPrompt', {
      channel: selectedSkill.channels[0] ?? translate('thisChannel'),
      name: selectedSkill.name,
    });
    push(href(`${APP_ROUTES.AGENT.NEW}?prompt=${encodeURIComponent(prompt)}`));
  }, [href, push, selectedSkill, translate]);

  const handleSkillSelect = useCallback(
    (id: string) => {
      const skill = skills.find((s) => s.id === id) ?? null;
      dispatch({ type: 'SELECT_SKILL', id, draft: draftFromSkill(skill) });
      openModal(ModalEnum.SKILL);
    },
    [skills],
  );

  const handleCloseDetail = useCallback(() => {
    dispatch({ type: 'CLEAR_SELECTED_SKILL' });
  }, []);

  if (!isReady || !brandId) {
    return <Loading isFullSize={false} />;
  }

  if (!isScopeMatch) {
    return (
      <div className="w-full">
        <div
          className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {translate('errors.brandUnavailable')}
        </div>
      </div>
    );
  }

  return (
    <Container
      fullWidth
      label={translate('heading')}
      right={
        <SkillFilters
          agentHref={href(APP_ROUTES.AGENT.ROOT)}
          modalityFilter={modalityFilter}
          onModalityFilterChange={(value) =>
            dispatch({ type: 'SET_MODALITY_FILTER', value })
          }
          onRefresh={() => void refreshCatalog()}
          onSearchQueryChange={(value) =>
            dispatch({ type: 'SET_SEARCH_QUERY', value })
          }
          onSourceFilterChange={(value) =>
            dispatch({ type: 'SET_SOURCE_FILTER', value })
          }
          onStageFilterChange={(value) =>
            dispatch({ type: 'SET_STAGE_FILTER', value })
          }
          searchQuery={searchQuery}
          sourceFilter={sourceFilter}
          stageFilter={stageFilter}
        />
      }
      titleVisibility="sr-only"
    >
      {error ? (
        <div
          className="mb-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <SkillsTable
        enabledSlugs={enabledSlugs}
        isLoading={isLoading}
        isTogglingSkill={isTogglingSkill}
        onSkillSelect={handleSkillSelect}
        onToggleSkill={(slug) => void toggleSkill(slug)}
        skills={filteredSkills}
      />

      <SkillDetailSheet
        customizing={isCustomizing}
        onClose={handleCloseDetail}
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
    </Container>
  );
}
