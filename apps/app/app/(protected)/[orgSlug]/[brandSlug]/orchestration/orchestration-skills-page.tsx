'use client';

import { useAuth } from '@clerk/nextjs';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { useBrandEnabledSkills } from '@hooks/data/skills/use-brand-enabled-skills';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { type Skill, SkillsService } from '@services/content/skills.service';
import { useRouter } from 'next/navigation';
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
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

export default function OrchestrationSkillsPage() {
  const { push } = useRouter();
  const { orgHref } = useOrgUrl();
  const { getToken } = useAuth();
  const { isReady, selectedBrand } = useBrand();

  const { enabledSlugs, toggleSkill } = useBrandEnabledSkills();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilterValue>('all');
  const [modalityFilter, setModalityFilter] =
    useState<ModalityFilterValue>('all');
  const [stageFilter, setStageFilter] = useState<StageFilterValue>('all');
  const [loading, setLoading] = useState(true);
  const [savingSkill, setSavingSkill] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skillDraft, setSkillDraft] = useState<SkillDraft>({
    defaultInstructions: '',
    description: '',
    name: '',
    systemPromptTemplate: '',
  });

  const getSkillsService = useCallback(async () => {
    const token = await resolveClerkToken(getToken);
    if (!token) {
      throw new Error('Authentication token unavailable');
    }
    return SkillsService.getInstance(token);
  }, [getToken]);

  const refreshCatalog = useCallback(async () => {
    if (!isReady) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const service = await getSkillsService();
      const catalogSkills = await service.listSkills();

      startTransition(() => {
        setSkills(catalogSkills);
      });
    } catch {
      setError('Failed to load the agent skill catalog.');
    } finally {
      setLoading(false);
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

  const selectedSkill = useMemo(
    () =>
      filteredSkills.find((skill) => skill.id === selectedSkillId) ??
      filteredSkills[0] ??
      null,
    [filteredSkills, selectedSkillId],
  );

  useEffect(() => {
    if (selectedSkill && selectedSkill.id !== selectedSkillId) {
      setSelectedSkillId(selectedSkill.id);
    }
  }, [selectedSkill, selectedSkillId]);

  useEffect(() => {
    setSkillDraft({
      defaultInstructions: selectedSkill?.defaultInstructions ?? '',
      description: selectedSkill?.description ?? '',
      name: selectedSkill?.name ?? '',
      systemPromptTemplate: selectedSkill?.systemPromptTemplate ?? '',
    });
  }, [selectedSkill]);

  const handleSaveSkill = useCallback(async () => {
    if (!selectedSkill?.organization) {
      return;
    }

    setSavingSkill(true);
    setError(null);

    try {
      const service = await getSkillsService();
      await service.updateSkill(selectedSkill.id, {
        defaultInstructions: skillDraft.defaultInstructions.trim() || undefined,
        description: skillDraft.description.trim(),
        name: skillDraft.name.trim(),
        systemPromptTemplate:
          skillDraft.systemPromptTemplate.trim() || undefined,
      });
      await refreshCatalog();
    } catch {
      setError('Failed to update the selected skill variant.');
    } finally {
      setSavingSkill(false);
    }
  }, [
    getSkillsService,
    refreshCatalog,
    selectedSkill,
    skillDraft.defaultInstructions,
    skillDraft.description,
    skillDraft.name,
    skillDraft.systemPromptTemplate,
  ]);

  const handleCustomize = useCallback(async () => {
    if (!selectedSkill) {
      return;
    }

    setCustomizing(true);
    setError(null);

    try {
      const service = await getSkillsService();
      const customizedSkill = await service.customizeSkill(selectedSkill.id, {
        name: `${selectedSkill.name} Custom`,
      });
      await refreshCatalog();
      setSelectedSkillId(customizedSkill.id);
    } catch {
      setError('Failed to create a brand-editable skill variant.');
    } finally {
      setCustomizing(false);
    }
  }, [getSkillsService, refreshCatalog, selectedSkill]);

  const handleOpenTestInChat = useCallback(() => {
    if (!selectedSkill) {
      return;
    }

    const prompt = buildSkillTestPrompt(selectedSkill);
    push(orgHref(`/chat/new?prompt=${encodeURIComponent(prompt)}`));
  }, [orgHref, push, selectedSkill]);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 md:px-6 lg:px-8">
      <SkillsPageHeader
        brandLabel={selectedBrand?.label}
        onRefresh={() => void refreshCatalog()}
        onSourceFilterChange={setSourceFilter}
        sourceFilter={sourceFilter}
      />

      {error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SkillCatalogCard
          enabledSlugs={enabledSlugs}
          filteredSkills={filteredSkills}
          isLoading={loading}
          modalityFilter={modalityFilter}
          onModalityFilterChange={setModalityFilter}
          onSkillSelect={setSelectedSkillId}
          onStageFilterChange={setStageFilter}
          onToggleSkill={(slug) => void toggleSkill(slug)}
          selectedSkillId={selectedSkill?.id}
          stageFilter={stageFilter}
        />

        <SkillDetailCard
          customizing={customizing}
          onCustomize={() => void handleCustomize()}
          onOpenTestInChat={handleOpenTestInChat}
          onSaveSkill={() => void handleSaveSkill()}
          onSkillDraftChange={setSkillDraft}
          savingSkill={savingSkill}
          selectedSkill={selectedSkill}
          skillDraft={skillDraft}
        />
      </div>
    </div>
  );
}
