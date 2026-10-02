'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  getBrandOrganizationId,
  getBrandOrganizationSlug,
} from '@contexts/user/brand-context/brand-context.helpers';
import { useRoutedOrganization } from '@genfeedai/contexts/user/organization-context/organization-context';
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
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import { Switch } from '@ui/primitives/switch';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import SkillDetailSheet from './skill-detail-sheet';
import { prepareSkillDraftPatch } from './skill-draft-patch';
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
  originalSkillDraft: emptyDraft(),
  forkCreatedForSkillId: '',
  skills: [],
  sourceFilter: 'all',
  stageFilter: 'all',
};

function pageReducer(state: PageState, action: PageAction): PageState {
  switch (action.type) {
    case 'RESET':
      return { ...initialState };
    case 'FORK_CREATED':
      return { ...state, forkCreatedForSkillId: action.sourceId };
    case 'HYDRATE_SKILL':
      return {
        ...state,
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
        originalSkillDraft: action.draft,
        error: null,
        isCustomizing: false,
        isSavingSkill: false,
      };
    case 'CLEAR_SELECTED_SKILL':
      return {
        ...state,
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

export default function BrandSettingsSkillsPage() {
  const translate = useTranslations('common.settings.skills');
  const params = useParams<{ brandSlug: string; orgSlug: string }>();
  const { push } = useRouter();
  const { href } = useOrgUrl();
  const { getToken, userId, sessionId, isSignedIn } = useAuthIdentity();
  const routedOrganization = useRoutedOrganization();
  const { brandId, isReady, selectedBrand } = useBrand();

  const catalogRequestIdRef = useRef(0);
  const catalogScopeKeyRef = useRef('');
  const lifecycleRef = useRef({
    isActive: true,
    epoch: 0,
    scopeKey: '',
    selectedId: '',
    operationId: 0,
    pendingId: 0,
  });

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
    originalSkillDraft,
    forkCreatedForSkillId,
    skills: catalogSkillsState,
    sourceFilter,
    stageFilter,
  } = state;

  const organizationId = getBrandOrganizationId(selectedBrand);
  const isScopeMatch = Boolean(
    isReady &&
      isSignedIn &&
      userId &&
      sessionId &&
      organizationId &&
      routedOrganization.status === 'matched' &&
      routedOrganization.isRouteConfirmed &&
      routedOrganization.confirmedOrganizationId === organizationId &&
      routedOrganization.confirmedOrganizationSlug === params.orgSlug &&
      brandId &&
      selectedBrand?.id === brandId &&
      selectedBrand.slug === params.brandSlug &&
      getBrandOrganizationSlug(selectedBrand) === params.orgSlug,
  );
  const scopeKey = JSON.stringify([
    organizationId,
    brandId,
    params.orgSlug,
    params.brandSlug,
    userId,
    sessionId,
    isSignedIn,
    isScopeMatch,
  ]);
  // Render-time invalidation prevents an old await from committing before effects run.
  if (lifecycleRef.current.scopeKey !== scopeKey) {
    lifecycleRef.current.scopeKey = scopeKey;
    lifecycleRef.current.epoch += 1;
    lifecycleRef.current.pendingId = 0;
    lifecycleRef.current.selectedId = '';
  }

  const skills =
    catalogScopeKeyRef.current === scopeKey ? catalogSkillsState : [];

  const defaultSkillSlugs = useMemo(
    () => skills.filter((skill) => skill.isDefault).map((skill) => skill.slug),
    [skills],
  );
  const {
    enabledSlugs,
    isLoading: isTogglingSkill,
    isUsingDefaults,
    pendingSlugs,
    setUseDefaults,
    toggleSkill,
  } = useBrandEnabledSkills({ defaultSlugs: defaultSkillSlugs });

  const acquireService = useCallback(
    async (isCurrent: () => boolean) => {
      const token = await resolveAuthToken(getToken);
      if (!isCurrent()) return null;
      if (!token)
        throw new Error(translate('errors.authenticationUnavailable'));
      return SkillsService.forOrganization(token, organizationId);
    },
    [getToken, organizationId, translate],
  );

  const refreshCatalog = useCallback(async () => {
    const lifecycle = lifecycleRef.current;
    const epoch = ++lifecycle.epoch;
    const requestId = ++catalogRequestIdRef.current;
    lifecycle.pendingId = 0;
    lifecycle.selectedId = '';
    dispatch({ type: 'RESET' });
    closeModal(ModalEnum.SKILL);
    if (!isScopeMatch) return;
    const isCurrent = () =>
      lifecycleRef.current.isActive &&
      lifecycleRef.current.epoch === epoch &&
      lifecycleRef.current.scopeKey === scopeKey &&
      requestId === catalogRequestIdRef.current;
    try {
      const service = await acquireService(isCurrent);
      if (!isCurrent() || !service) return;
      const catalogSkills = await service.listSkills();
      if (!isCurrent()) return;
      catalogScopeKeyRef.current = scopeKey;
      dispatch({ type: 'LOAD_SUCCESS', skills: catalogSkills });
    } catch {
      if (!isCurrent()) return;
      catalogScopeKeyRef.current = scopeKey;
      dispatch({ type: 'LOAD_ERROR', message: translate('errors.loadFailed') });
    }
  }, [acquireService, isScopeMatch, scopeKey, translate]);

  useEffect(() => {
    lifecycleRef.current.isActive = true;
    void refreshCatalog();
    return () => {
      lifecycleRef.current.epoch += 1;
      lifecycleRef.current.isActive = false;
      lifecycleRef.current.pendingId = 0;
      closeModal(ModalEnum.SKILL);
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

  const effectiveSkillDraft = skillDraft;
  const preparedPatch = prepareSkillDraftPatch(
    originalSkillDraft,
    effectiveSkillDraft,
  );
  const isPending = isSavingSkill || isCustomizing;

  const beginOperation = useCallback(() => {
    const lifecycle = lifecycleRef.current;
    if (
      !isScopeMatch ||
      !lifecycle.isActive ||
      lifecycle.scopeKey !== scopeKey ||
      lifecycle.pendingId ||
      !selectedSkill ||
      lifecycle.selectedId !== selectedSkill.id
    )
      return null;
    const epoch = lifecycle.epoch;
    const id = ++lifecycle.operationId;
    const selectedId = selectedSkill.id;
    lifecycle.pendingId = id;
    const isCurrent = () =>
      lifecycleRef.current.isActive &&
      lifecycleRef.current.epoch === epoch &&
      lifecycleRef.current.scopeKey === scopeKey &&
      lifecycleRef.current.selectedId === selectedId &&
      lifecycleRef.current.pendingId === id;
    return {
      isCurrent,
      finish: () => {
        if (isCurrent()) lifecycleRef.current.pendingId = 0;
      },
    };
  }, [isScopeMatch, scopeKey, selectedSkill]);

  const handleSaveSkill = useCallback(async () => {
    if (
      selectedSkill?.canEdit !== true ||
      !preparedPatch.hasChanges ||
      preparedPatch.errors.length
    )
      return;
    const operation = beginOperation();
    if (!operation) return;
    dispatch({ type: 'SAVE_START' });
    try {
      const service = await acquireService(operation.isCurrent);
      if (!operation.isCurrent() || !service) return;
      await service.updateSkill(selectedSkill.id, preparedPatch.patch);
      if (!operation.isCurrent()) return;
      const hydrated = await service.getSkill(selectedSkill.id);
      if (!operation.isCurrent()) return;
      if (hydrated.id !== selectedSkill.id)
        throw new Error('Skill details unavailable');
      const catalog = await service.listSkills();
      if (!operation.isCurrent()) return;
      dispatch({ type: 'LOAD_SUCCESS', skills: catalog });
      dispatch({ type: 'HYDRATE_SKILL', skill: hydrated });
    } catch {
      if (!operation.isCurrent()) return;
      dispatch({
        type: 'SAVE_ERROR',
        message: translate('errors.updateFailed'),
      });
    } finally {
      operation.finish();
    }
  }, [acquireService, beginOperation, preparedPatch, selectedSkill, translate]);

  const handleCustomize = useCallback(async () => {
    if (
      selectedSkill?.canFork !== true ||
      forkCreatedForSkillId === selectedSkill.id
    )
      return;
    const operation = beginOperation();
    if (!operation) return;
    let isCreated = false;
    dispatch({ type: 'CUSTOMIZE_START' });
    try {
      const service = await acquireService(operation.isCurrent);
      if (!operation.isCurrent() || !service) return;
      const fork = await service.forkSkill(selectedSkill.id);
      if (!operation.isCurrent()) return;
      isCreated = true;
      dispatch({ type: 'FORK_CREATED', sourceId: selectedSkill.id });
      if (typeof fork.id !== 'string' || !fork.id)
        throw new Error('Fork details unavailable');
      const hydrated = await service.getSkill(fork.id);
      if (!operation.isCurrent()) return;
      if (hydrated.id !== fork.id) throw new Error('Fork details unavailable');
      dispatch({ type: 'HYDRATE_SKILL', skill: hydrated });
      operation.finish();
      lifecycleRef.current.selectedId = hydrated.id;
      lifecycleRef.current.epoch += 1;
    } catch {
      if (!operation.isCurrent()) return;
      dispatch({
        type: 'CUSTOMIZE_ERROR',
        message: translate(
          isCreated ? 'errors.forkDetailsFailed' : 'errors.forkFailed',
        ),
      });
    } finally {
      operation.finish();
    }
  }, [
    acquireService,
    beginOperation,
    forkCreatedForSkillId,
    selectedSkill,
    translate,
  ]);

  const handleExportSkill = useCallback(async () => {
    if (selectedSkill?.canExport !== true) return;
    const operation = beginOperation();
    if (!operation) return;
    dispatch({ type: 'SAVE_START' });
    try {
      const service = await acquireService(operation.isCurrent);
      if (!operation.isCurrent() || !service) return;
      const exported = await service.exportSkill(selectedSkill.id);
      if (!operation.isCurrent()) return;
      const blob = new Blob([JSON.stringify(exported, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${selectedSkill.slug}.skill.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      dispatch({ type: 'SAVE_SUCCESS' });
    } catch {
      if (!operation.isCurrent()) return;
      dispatch({
        type: 'SAVE_ERROR',
        message: translate('errors.exportFailed'),
      });
    } finally {
      operation.finish();
    }
  }, [acquireService, beginOperation, selectedSkill, translate]);

  const handleArchiveSkill = useCallback(async () => {
    if (selectedSkill?.canEdit !== true) return;
    const operation = beginOperation();
    if (!operation) return;
    dispatch({ type: 'SAVE_START' });
    try {
      const service = await acquireService(operation.isCurrent);
      if (!operation.isCurrent() || !service) return;
      await service.archiveSkill(selectedSkill.id);
      if (!operation.isCurrent()) return;
      const catalog = await service.listSkills();
      if (!operation.isCurrent()) return;
      dispatch({ type: 'LOAD_SUCCESS', skills: catalog });
      dispatch({ type: 'CLEAR_SELECTED_SKILL' });
      closeModal(ModalEnum.SKILL);
      operation.finish();
      lifecycleRef.current.selectedId = '';
      lifecycleRef.current.epoch += 1;
    } catch {
      if (!operation.isCurrent()) return;
      dispatch({
        type: 'SAVE_ERROR',
        message: translate('errors.archiveFailed'),
      });
    } finally {
      operation.finish();
    }
  }, [acquireService, beginOperation, selectedSkill, translate]);

  const handleOpenSamplePrompt = useCallback(() => {
    if (
      !isScopeMatch ||
      !selectedSkill ||
      isPending ||
      lifecycleRef.current.pendingId !== 0 ||
      lifecycleRef.current.scopeKey !== scopeKey ||
      lifecycleRef.current.selectedId !== selectedSkill.id
    )
      return;
    const prompt = translate('samplePrompt', {
      channel: selectedSkill.channels[0] ?? translate('thisChannel'),
      name: selectedSkill.name,
    });
    push(href(`${APP_ROUTES.AGENT.NEW}?prompt=${encodeURIComponent(prompt)}`));
  }, [href, push, selectedSkill, isPending, isScopeMatch, scopeKey, translate]);

  const handleSkillSelect = useCallback(
    (id: string) => {
      if (!isScopeMatch || lifecycleRef.current.scopeKey !== scopeKey) return;
      const skill = skills.find((item) => item.id === id);
      if (!skill) return;
      lifecycleRef.current.epoch += 1;
      lifecycleRef.current.pendingId = 0;
      lifecycleRef.current.selectedId = id;
      dispatch({ type: 'SELECT_SKILL', id, draft: draftFromSkill(skill) });
      openModal(ModalEnum.SKILL);
    },
    [isScopeMatch, scopeKey, skills],
  );

  const handleCloseDetail = useCallback(() => {
    lifecycleRef.current.epoch += 1;
    lifecycleRef.current.pendingId = 0;
    lifecycleRef.current.selectedId = '';
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

  if (catalogScopeKeyRef.current !== scopeKey)
    return <Loading isFullSize={false} />;

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

      <InsetSurface className="mb-4" density="compact">
        <Switch
          aria-label={translate('catalog.useDefaults')}
          checked={isUsingDefaults}
          description={translate('catalog.useDefaultsDescription')}
          isDisabled={isTogglingSkill || isLoading}
          label={translate('catalog.useDefaults')}
          onCheckedChange={(isChecked) => void setUseDefaults(isChecked)}
        />
      </InsetSurface>

      <SkillsTable
        enabledSlugs={enabledSlugs}
        isLoading={isLoading}
        pendingSlugs={pendingSlugs}
        onSkillSelect={handleSkillSelect}
        onToggleSkill={(slug) => void toggleSkill(slug)}
        skills={filteredSkills}
      />

      <SkillDetailSheet
        customizing={isCustomizing}
        hasChanges={preparedPatch.hasChanges}
        draftErrors={preparedPatch.errors}
        isForkBlocked={forkCreatedForSkillId === selectedSkillId}
        onArchiveSkill={() => void handleArchiveSkill()}
        onClose={handleCloseDetail}
        onExportSkill={() => void handleExportSkill()}
        onCustomize={() => void handleCustomize()}
        onOpenSamplePrompt={handleOpenSamplePrompt}
        onSaveSkill={() => void handleSaveSkill()}
        onSkillDraftChange={(updater) =>
          isScopeMatch &&
          !isPending &&
          lifecycleRef.current.pendingId === 0 &&
          selectedSkill?.canEdit === true &&
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
