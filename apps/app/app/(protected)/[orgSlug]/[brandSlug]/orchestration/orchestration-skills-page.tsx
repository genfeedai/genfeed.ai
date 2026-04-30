'use client';

import { useAuth } from '@clerk/nextjs';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/enums';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { useBrandEnabledSkills } from '@hooks/data/skills/use-brand-enabled-skills';
import { type Skill, SkillsService } from '@services/content/skills.service';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import { Button } from '@ui/primitives/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import { Input } from '@ui/primitives/input';
import { Switch } from '@ui/primitives/switch';
import { Textarea } from '@ui/primitives/textarea';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  HiOutlineArrowPath,
  HiOutlineBeaker,
  HiOutlineSparkles,
} from 'react-icons/hi2';

const SOURCE_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Built-in', value: 'built_in' },
  { label: 'Imported', value: 'imported' },
  { label: 'Custom', value: 'custom' },
] as const;

const MODALITY_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Text', value: 'text' },
  { label: 'Image', value: 'image' },
  { label: 'Video', value: 'video' },
  { label: 'Audio', value: 'audio' },
] as const;

const STAGE_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Research', value: 'research' },
  { label: 'Planning', value: 'planning' },
  { label: 'Creation', value: 'creation' },
  { label: 'Review', value: 'review' },
  { label: 'Publishing', value: 'publishing' },
  { label: 'Analysis', value: 'analysis' },
] as const;

type FilterValue<T extends readonly { value: string }[]> = T[number]['value'];

type SkillDraft = {
  defaultInstructions: string;
  description: string;
  name: string;
  systemPromptTemplate: string;
};

function buildSkillTestPrompt(skill: Skill): string {
  return `Use my ${skill.name} setup to create a small sample for ${skill.channels[0] ?? 'this channel'}. Explain how the skill affects the output.`;
}

function getSourceBadgeVariant(
  source: Skill['source'],
): 'accent' | 'outline' | 'secondary' {
  switch (source) {
    case 'custom':
      return 'accent';
    case 'imported':
      return 'secondary';
    default:
      return 'outline';
  }
}

function getModalityBadgeVariant(
  modality: string,
): 'audio' | 'ghost' | 'image' | 'multimodal' | 'text' | 'video' {
  switch (modality) {
    case 'audio':
      return 'audio';
    case 'image':
      return 'image';
    case 'multi':
      return 'multimodal';
    case 'text':
      return 'text';
    case 'video':
      return 'video';
    default:
      return 'ghost';
  }
}

export default function OrchestrationSkillsPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { isReady, selectedBrand } = useBrand();

  const { enabledSlugs, toggleSkill } = useBrandEnabledSkills();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState<string>('');
  const [sourceFilter, setSourceFilter] =
    useState<FilterValue<typeof SOURCE_FILTERS>>('all');
  const [modalityFilter, setModalityFilter] =
    useState<FilterValue<typeof MODALITY_FILTERS>>('all');
  const [stageFilter, setStageFilter] =
    useState<FilterValue<typeof STAGE_FILTERS>>('all');
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
      .filter((skill) =>
        sourceFilter === 'all' ? true : skill.source === sourceFilter,
      )
      .filter((skill) =>
        modalityFilter === 'all'
          ? true
          : skill.modalities.includes(modalityFilter) ||
            skill.modalities.includes('multi'),
      )
      .filter((skill) =>
        stageFilter === 'all' ? true : skill.workflowStage === stageFilter,
      )
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
    router.push(`/chat/new?prompt=${encodeURIComponent(prompt)}`);
  }, [router, selectedSkill]);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 md:px-6 lg:px-8">
      <Card
        bodyClassName="gap-4 p-6"
        className="rounded-3xl border-white/10 bg-black/20"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/50">
              Agent Skills
            </p>
            <h1 className="text-3xl font-semibold text-foreground">
              Brand content behavior
            </h1>
            <p className="max-w-3xl text-sm text-foreground/60">
              Browse built-in Genfeed skills and customize them into org-owned
              variants for{' '}
              <span className="font-medium text-foreground">
                {selectedBrand?.label || 'this brand'}
              </span>
              . Skill enablement is managed via brand agent configuration.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              className="rounded-full"
              onClick={() => void refreshCatalog()}
              variant={ButtonVariant.OUTLINE}
            >
              <HiOutlineArrowPath className="h-4 w-4" />
              Refresh
            </Button>
            <Button
              asChild
              className="rounded-full"
              variant={ButtonVariant.OUTLINE}
            >
              <Link href="/chat">
                <HiOutlineSparkles className="h-4 w-4" />
                Open Chat
              </Link>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {SOURCE_FILTERS.map((filter) => (
            <Button
              className="rounded-full"
              key={filter.value}
              onClick={() => setSourceFilter(filter.value)}
              variant={
                sourceFilter === filter.value
                  ? ButtonVariant.DEFAULT
                  : ButtonVariant.OUTLINE
              }
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </Card>

      {error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card
          bodyClassName="gap-0 p-5"
          className="rounded-3xl border-white/10 bg-black/20"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Catalog</h2>
              <p className="text-sm text-foreground/55">
                Browse built-in, imported, and brand-editable content skills.
              </p>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {MODALITY_FILTERS.map((filter) => (
              <Button
                className="rounded-full"
                key={filter.value}
                onClick={() => setModalityFilter(filter.value)}
                variant={
                  modalityFilter === filter.value
                    ? ButtonVariant.DEFAULT
                    : ButtonVariant.OUTLINE
                }
              >
                {filter.label}
              </Button>
            ))}
            {STAGE_FILTERS.map((filter) => (
              <Button
                className="rounded-full"
                key={filter.value}
                onClick={() => setStageFilter(filter.value)}
                variant={
                  stageFilter === filter.value
                    ? ButtonVariant.DEFAULT
                    : ButtonVariant.OUTLINE
                }
              >
                {filter.label}
              </Button>
            ))}
          </div>

          <div className="grid gap-3">
            {loading ? (
              <InsetSurface className="text-sm text-foreground/55">
                Loading skill catalog...
              </InsetSurface>
            ) : null}

            {!loading && filteredSkills.length === 0 ? (
              <InsetSurface className="text-sm text-foreground/55">
                No skills match the current filters.
              </InsetSurface>
            ) : null}

            {filteredSkills.map((skill) => {
              const isSelected = selectedSkill?.id === skill.id;
              const isEnabled = enabledSlugs.includes(skill.slug);

              return (
                <div
                  className={`relative rounded-2xl border ${
                    isSelected
                      ? 'border-white/30 bg-white/[0.06]'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                  } ${!isEnabled ? 'opacity-50' : ''}`}
                  key={skill.id}
                >
                  <Button
                    className="h-auto w-full flex-col items-stretch rounded-2xl p-4 pr-16 text-left"
                    onClick={() => setSelectedSkillId(skill.id)}
                    variant={ButtonVariant.UNSTYLED}
                    withWrapper={false}
                  >
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {skill.name}
                      </span>
                      <Badge
                        className="px-2 py-1 text-[11px] uppercase tracking-[0.14em]"
                        variant={getSourceBadgeVariant(skill.source)}
                      >
                        {skill.source.replace('_', ' ')}
                      </Badge>
                      <Badge
                        className="px-2 py-1 text-[11px] uppercase tracking-[0.14em]"
                        variant="ghost"
                      >
                        {skill.workflowStage}
                      </Badge>
                    </div>

                    <p className="mb-3 text-sm text-foreground/65">
                      {skill.description}
                    </p>

                    <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em] text-foreground/45">
                      {skill.modalities.map((modality) => (
                        <Badge
                          className="px-2 py-1 text-[11px] uppercase tracking-[0.14em]"
                          key={`${skill.id}-${modality}`}
                          variant={getModalityBadgeVariant(modality)}
                        >
                          {modality}
                        </Badge>
                      ))}
                      {skill.channels.map((channel) => (
                        <Badge
                          className="px-2 py-1 text-[11px] uppercase tracking-[0.14em]"
                          key={`${skill.id}-${channel}`}
                          variant="outline"
                        >
                          {channel}
                        </Badge>
                      ))}
                    </div>
                  </Button>
                  <Switch
                    checked={isEnabled}
                    className="absolute top-4 right-4"
                    onCheckedChange={() => void toggleSkill(skill.slug)}
                  />
                </div>
              );
            })}
          </div>
        </Card>

        <Card
          bodyClassName="gap-0 p-5"
          className="rounded-3xl border-white/10 bg-black/20"
        >
          {selectedSkill ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-foreground">
                    {selectedSkill.name}
                  </h2>
                  <Badge
                    className="px-2 py-1 text-[11px] uppercase tracking-[0.14em]"
                    variant="outline"
                  >
                    {selectedSkill.slug}
                  </Badge>
                </div>
                <p className="text-sm text-foreground/60">
                  {selectedSkill.description}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <InsetSurface>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground/45">
                    Coverage
                  </p>
                  <p className="text-sm text-foreground/65">
                    {selectedSkill.modalities.join(', ')} across{' '}
                    {selectedSkill.channels.join(', ') || 'general channels'}.
                  </p>
                </InsetSurface>
                <InsetSurface>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground/45">
                    Stage
                  </p>
                  <p className="text-sm text-foreground/65">
                    Designed for the {selectedSkill.workflowStage} step of the
                    content workflow.
                  </p>
                </InsetSurface>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  className="rounded-full"
                  onClick={handleOpenTestInChat}
                  variant={ButtonVariant.OUTLINE}
                >
                  <HiOutlineBeaker className="h-4 w-4" />
                  Test in chat
                </Button>
              </div>

              <InsetSurface className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Skill definition
                    </p>
                    <p className="text-sm text-foreground/55">
                      Built-in and imported skills can be customized into an
                      editable org variant. Org-owned variants can be edited
                      here directly.
                    </p>
                  </div>
                  {!selectedSkill.organization ? (
                    <Button
                      className="rounded-full"
                      disabled={customizing}
                      onClick={() => void handleCustomize()}
                      variant={ButtonVariant.OUTLINE}
                    >
                      <HiOutlineSparkles className="h-4 w-4" />
                      {customizing ? 'Customizing...' : 'Customize'}
                    </Button>
                  ) : null}
                </div>

                <label className="grid gap-2 text-sm text-foreground/70">
                  Name
                  <Input
                    className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-foreground outline-none"
                    disabled={!selectedSkill.organization}
                    onChange={(event) =>
                      setSkillDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    value={skillDraft.name}
                  />
                </label>

                <label className="grid gap-2 text-sm text-foreground/70">
                  Description
                  <Textarea
                    className="min-h-24 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-foreground outline-none"
                    disabled={!selectedSkill.organization}
                    onChange={(event) =>
                      setSkillDraft((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    value={skillDraft.description}
                  />
                </label>

                <label className="grid gap-2 text-sm text-foreground/70">
                  Default instructions
                  <Textarea
                    className="min-h-28 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-mono text-foreground outline-none"
                    disabled={!selectedSkill.organization}
                    onChange={(event) =>
                      setSkillDraft((current) => ({
                        ...current,
                        defaultInstructions: event.target.value,
                      }))
                    }
                    value={skillDraft.defaultInstructions}
                  />
                </label>

                <Collapsible>
                  <CollapsibleTrigger className="text-sm font-medium text-foreground/50 hover:text-foreground/70">
                    Advanced: System Prompt Template
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-2">
                      <p className="text-xs text-foreground/40">
                        The exact text injected into the agent system prompt at
                        runtime. Falls back to Default Instructions if empty.
                      </p>
                      <Textarea
                        className="min-h-32 w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-mono text-foreground outline-none"
                        disabled={!selectedSkill.organization}
                        onChange={(event) =>
                          setSkillDraft((current) => ({
                            ...current,
                            systemPromptTemplate: event.target.value,
                          }))
                        }
                        placeholder="Leave empty to use Default Instructions above"
                        value={skillDraft.systemPromptTemplate}
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {selectedSkill.organization ? (
                  <Button
                    disabled={savingSkill}
                    onClick={() => void handleSaveSkill()}
                    variant={ButtonVariant.DEFAULT}
                  >
                    {savingSkill ? 'Saving...' : 'Save variant'}
                  </Button>
                ) : null}
              </InsetSurface>
            </div>
          ) : (
            <InsetSurface className="text-sm text-foreground/55">
              Select a skill from the catalog to inspect its detail.
            </InsetSurface>
          )}
        </Card>
      </div>
    </div>
  );
}
