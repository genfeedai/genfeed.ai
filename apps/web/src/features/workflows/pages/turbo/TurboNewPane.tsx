'use client';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAgentChatStore } from '@genfeedai/agent';
import { ButtonVariant, TurboProjectKind } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  resolveOrganizationModulePresentationAccess,
} from '@genfeedai/contracts/constants';
import type {
  CreativeAppAgentContext,
  CreativeAppProjectReference,
  TurboIdeaFormat,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  getJsonApiErrorMember,
  getJsonApiErrorMessage,
} from '@services/core/json-api-error-message';
import ProjectChoicePrompt from '@ui/layout/project-choice-prompt/ProjectChoicePrompt';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';
import PromptEmptyState from '@ui/layout/prompt-empty-state/PromptEmptyState';
import { Button } from '@ui/primitives/button';
import { ghostSelectTriggerClassName } from '@ui/primitives/field-control';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import PromptBarCompactSelect from '@ui/prompt-bars/components/toolbar/PromptBarCompactSelect';
import PromptBarSendButton from '@ui/prompt-bars/components/toolbar/PromptBarSendButton';
import PromptBarToolbar from '@ui/prompt-bars/components/toolbar/PromptBarToolbar';
import PromptEditor from '@ui/prompt-editor/PromptEditor';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import SubscriptionRequiredState from '@/features/workflows/components/guards/subscription/SubscriptionRequiredState';
import type { TurboPreset } from '@/features/workflows/props/turbo-presets.props';
import {
  createWorkflowApiService,
  type WorkflowSummary,
} from '@/features/workflows/services/workflow-api';
import { useCreativeAppAgentContext } from '@/hooks/agent/use-creative-app-agent-context/use-creative-app-agent-context';
import { useFeatureFlagContext } from '@/hooks/feature-flags/provider';
import { useFeatureFlag } from '@/hooks/feature-flags/use-feature-flag';
import { isProjectChangeRequest } from '@/lib/creative-apps/project-change-request';
import TurboPromptCards from './TurboPromptCards';
import { createTurboProjectsApi } from './turbo-projects-api';

/** The server keeps at most this many characters of the creative angle. */
const MAX_ANGLE_LENGTH = 300;
const MAX_NAME_LENGTH = 60;
const COUNT_OPTIONS = [3, 6, 9, 12, 18] as const;
const FORMAT_OPTIONS: readonly (readonly TurboIdeaFormat[])[] = [
  ['image'],
  ['video'],
  ['avatar'],
  ['image', 'video'],
  ['video', 'avatar'],
  ['image', 'video', 'avatar'],
];
const DEFAULT_FORMATS: readonly TurboIdeaFormat[] = ['image', 'video'];

function formatsKey(formats: readonly TurboIdeaFormat[]): string {
  return formats.join('+');
}

/** A short project name taken from the first words of the prompt. */
function nameFromPrompt(prompt: string): string {
  if (prompt.length <= MAX_NAME_LENGTH) return prompt;
  const cut = prompt.slice(0, MAX_NAME_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * The left side of the Turbo workspace while no project is open: a centered
 * prompt with starter cards and the prompt bar. Sending saves an idea project
 * with the prompt as its angle and opens it. Nothing is generated and no
 * credits are reserved until the creator accepts a quote on the project page.
 */
export default function TurboNewPane() {
  const t = useTranslations('pages.turboProjects');
  const { brandId, organizationId, settings, settingsLoading } = useBrand();
  const { flags: platformFlags } = useFeatureFlagContext();
  const automationAccess = resolveOrganizationModulePresentationAccess(
    settingsLoading ? null : settings,
    'automation',
    platformFlags,
  );
  const isWorkflowEnabled = automationAccess.isAllowed;
  const { href, orgHref } = useOrgUrl();
  const router = useRouter();
  const isIdeasEnabled = useFeatureFlag('turbo_ideas');
  const getService = useAuthedService(createTurboProjectsApi);
  const getWorkflows = useAuthedService(createWorkflowApiService);
  const seedComposer = useAgentChatStore((state) => state.seedComposer);
  const workflowScope = useMemo(
    () => ({ brandId, getWorkflows }),
    [brandId, getWorkflows],
  );
  const [workflowResult, setWorkflowResult] = useState<{
    scope: typeof workflowScope;
    items: WorkflowSummary[];
  } | null>(null);
  const workflows =
    workflowResult?.scope === workflowScope ? workflowResult.items : [];
  const [kind, setKind] = useState(() =>
    isIdeasEnabled ? TurboProjectKind.IDEAS : TurboProjectKind.WORKFLOW,
  );
  const [workflowId, setWorkflowId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [formats, setFormats] =
    useState<readonly TurboIdeaFormat[]>(DEFAULT_FORMATS);
  const [count, setCount] = useState<number>(6);
  const [preset, setPreset] = useState<{ angle: string; title: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubscriptionRequired, setIsSubscriptionRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<
    CreativeAppProjectReference[] | null
  >(null);
  const [projectChoice, setProjectChoice] = useState<string | null>(null);
  const admission = useRef({
    organizationId,
    brandId,
    kind,
    isIdeasEnabled,
    isWorkflowEnabled,
    workflowId,
  });
  admission.current = {
    organizationId,
    brandId,
    kind,
    isIdeasEnabled,
    isWorkflowEnabled,
    workflowId,
  };
  const submitting = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setWorkflowId('');
    setError(null);
    setIsSubscriptionRequired(false);
    setLoading(true);
    if (!brandId || kind !== TurboProjectKind.WORKFLOW || !isWorkflowEnabled) {
      setLoading(false);
      return () => controller.abort();
    }
    void getWorkflows()
      .then((service) =>
        controller.signal.aborted ? [] : service.list({ brandId }),
      )
      .then((items) => {
        if (!controller.signal.aborted)
          setWorkflowResult({ scope: workflowScope, items });
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(getJsonApiErrorMessage(reason, t('loadFailed')));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [getWorkflows, brandId, t, workflowScope, kind, isWorkflowEnabled]);
  useEffect(() => {
    const controller = new AbortController();
    setProjects(null);
    setProjectChoice(null);
    if (!brandId) return () => controller.abort();
    void getService()
      .then((service) => service.list(brandId, 1, controller.signal))
      .then((items) => {
        if (!controller.signal.aborted)
          setProjects(
            items.map((item) => ({
              id: item.id,
              title: item.name || t('untitled'),
            })),
          );
      })
      .catch(() => {
        // The list is only context for the agent; without it a change request
        // starts a new project as before.
        if (!controller.signal.aborted) setProjects([]);
      });
    return () => controller.abort();
  }, [brandId, getService, t]);
  const creativeApp = useMemo<CreativeAppAgentContext | null>(
    () => (projects ? { app: 'turbo', projects } : null),
    [projects],
  );
  useCreativeAppAgentContext(creativeApp);
  const trimmedPrompt = prompt.trim();
  const isIdeas = kind === TurboProjectKind.IDEAS;
  const canCreate =
    Boolean(brandId) &&
    (isIdeas
      ? isIdeasEnabled && trimmedPrompt.length <= MAX_ANGLE_LENGTH
      : isWorkflowEnabled &&
        !loading &&
        workflows.some((workflow) => workflow.id === workflowId));
  function applyPreset(next: TurboPreset, title: string) {
    setPrompt(next.angle);
    setFormats(next.formats);
    setCount(next.count);
    setPreset({ angle: next.angle, title });
    setError(null);
  }
  function projectName(): string {
    if (!isIdeas) {
      const workflow = workflows.find((item) => item.id === workflowId);
      return workflow?.label || t('untitled');
    }
    if (preset && preset.angle === trimmedPrompt) return preset.title;
    return trimmedPrompt ? nameFromPrompt(trimmedPrompt) : t('untitled');
  }
  function chooseProject(projectId: string) {
    if (projectChoice) seedComposer(projectChoice);
    router.push(href(`${APP_ROUTES.STUDIO.TURBO}/${projectId}`));
  }
  async function create(isNewProjectConfirmed = false) {
    if (busy || submitting.current || isSubscriptionRequired || !canCreate)
      return;
    // A change request is routed by the brand's project list; wait for it
    // rather than creating a project for work that already exists.
    if (
      !isNewProjectConfirmed &&
      isIdeas &&
      projects === null &&
      isProjectChangeRequest(trimmedPrompt)
    )
      return;
    setProjectChoice(null);
    if (
      !isNewProjectConfirmed &&
      isIdeas &&
      projects?.length &&
      isProjectChangeRequest(trimmedPrompt)
    ) {
      setProjectChoice(trimmedPrompt);
      return;
    }
    submitting.current = true;
    const intent = admission.current;
    setBusy(true);
    setError(null);
    try {
      const service = await getService();
      const current = admission.current;
      if (
        !mounted.current ||
        current.organizationId !== intent.organizationId ||
        current.brandId !== intent.brandId ||
        current.kind !== intent.kind ||
        (kind === TurboProjectKind.IDEAS && !current.isIdeasEnabled) ||
        (kind === TurboProjectKind.WORKFLOW &&
          (!current.isWorkflowEnabled ||
            current.workflowId !== intent.workflowId))
      )
        return;
      const project = await service.create({
        brandId,
        kind,
        name: projectName(),
        ...(kind === TurboProjectKind.WORKFLOW ? { workflowId } : {}),
      });
      if (kind === TurboProjectKind.IDEAS) {
        try {
          await service.update(project.id, {
            settings: {
              ideas: {
                count,
                formats: [...formats],
                ...(trimmedPrompt ? { angle: trimmedPrompt } : {}),
              },
            },
          });
        } catch {
          /* The draft exists with default idea settings; the creator can adjust them on the project page. */
        }
      }
      if (
        mounted.current &&
        admission.current.brandId === intent.brandId &&
        admission.current.organizationId === intent.organizationId
      )
        router.push(href(`${APP_ROUTES.STUDIO.TURBO}/${project.id}`));
    } catch (reason) {
      if (
        !mounted.current ||
        admission.current.brandId !== intent.brandId ||
        admission.current.organizationId !== intent.organizationId
      )
        return;
      const member = getJsonApiErrorMember(reason);
      setIsSubscriptionRequired(
        member?.status === 403 &&
          member.title === 'Active subscription required',
      );
      setError(getJsonApiErrorMessage(reason, t('saveFailed')));
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  if (isSubscriptionRequired) {
    return (
      <SubscriptionRequiredState
        message={error ?? t('saveFailed')}
        manageHref={orgHref(APP_ROUTES.SETTINGS.SUBSCRIPTION)}
        manageLabel={t('manageSubscription')}
      />
    );
  }
  const workflowNotice = !isWorkflowEnabled
    ? t(
        automationAccess.reason === 'subscription-required'
          ? 'workflowSubscriptionRequired'
          : automationAccess.reason === 'unavailable'
            ? 'workflowUnavailable'
            : 'workflowDisabled',
      )
    : null;
  const workflowNoticeLink =
    automationAccess.reason === 'subscription-required'
      ? { href: APP_ROUTES.SETTINGS.SUBSCRIPTION, label: 'manageSubscription' }
      : { href: APP_ROUTES.SETTINGS.GENERAL, label: 'manageModules' };
  const hasNoWorkflows =
    !isIdeas && isWorkflowEnabled && !loading && workflows.length === 0;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {projectChoice && projects ? (
        <ProjectChoicePrompt
          isDisabled={busy}
          newProjectLabel={t('projectChoiceNew')}
          onChoose={chooseProject}
          onCreateNew={() => void create(true)}
          projects={projects}
          question={t('projectChoiceQuestion')}
          request={projectChoice}
        />
      ) : (
        <PromptEmptyState
          description={t(isIdeas ? 'ideasDescription' : 'workflowDescription')}
          title={t('heroTitle')}
        >
          <div className="flex flex-col gap-4">
            {isIdeas ? (
              <TurboPromptCards
                isDisabled={busy || !isIdeasEnabled}
                onSelect={applyPreset}
              />
            ) : null}
            {isIdeasEnabled ? null : (
              <p className="text-center text-sm text-muted-foreground">
                {t('ideasDisabled')}
              </p>
            )}
            {workflowNotice && !isIdeas ? (
              <p className="text-center text-sm text-muted-foreground">
                {workflowNotice}{' '}
                <Link
                  href={orgHref(workflowNoticeLink.href)}
                  className="underline underline-offset-4"
                >
                  {t(workflowNoticeLink.label)}
                </Link>
              </p>
            ) : null}
            {!isIdeas && isWorkflowEnabled && loading ? (
              <p className="text-center text-sm text-muted-foreground">
                {t('loading')}
              </p>
            ) : null}
            {hasNoWorkflows ? (
              <div className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
                <p>{t('noWorkflows')}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button asChild variant={ButtonVariant.LINK}>
                    <Link href={href(APP_ROUTES.AUTOMATION.WORKFLOWS)}>
                      {t('createWorkflow')}
                    </Link>
                  </Button>
                  {isIdeasEnabled ? (
                    <Button
                      variant={ButtonVariant.SECONDARY}
                      onClick={() => setKind(TurboProjectKind.IDEAS)}
                    >
                      {t('fromIdeas')}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </PromptEmptyState>
      )}
      <div className="mt-auto shrink-0 px-3 pb-3">
        <PromptBarContainer
          className="mx-auto w-full max-w-2xl"
          layoutMode="inflow"
          maxWidth="full"
          zIndex={60}
        >
          <PromptBarComposer
            banner={
              error ? (
                <p role="alert" className="p-3 text-sm text-destructive">
                  {error}
                </p>
              ) : trimmedPrompt.length > MAX_ANGLE_LENGTH && isIdeas ? (
                <p role="alert" className="p-3 text-sm text-destructive">
                  {t('promptTooLong', { max: MAX_ANGLE_LENGTH })}
                </p>
              ) : undefined
            }
            data-testid="turbo-composer"
            density="compact"
          >
            {isIdeas ? (
              <PromptEditor
                ariaLabel={t('angle')}
                className="min-h-16"
                isDisabled={busy}
                onSubmit={() => void create()}
                onValueChange={setPrompt}
                placeholder={t('promptPlaceholder')}
                value={prompt}
              />
            ) : null}
            <PromptBarToolbar
              leading={
                <>
                  <PromptBarCompactSelect
                    ariaLabel={t('sourceAria')}
                    isDisabled={busy}
                    onChange={(next) => {
                      setKind(
                        next === TurboProjectKind.WORKFLOW
                          ? TurboProjectKind.WORKFLOW
                          : TurboProjectKind.IDEAS,
                      );
                      setError(null);
                    }}
                    options={[
                      {
                        isDisabled: !isIdeasEnabled,
                        label: t('fromIdeas'),
                        value: TurboProjectKind.IDEAS,
                      },
                      {
                        isDisabled: !isWorkflowEnabled,
                        label: t('fromWorkflow'),
                        value: TurboProjectKind.WORKFLOW,
                      },
                    ]}
                    value={kind}
                  />
                  {isIdeas ? (
                    <>
                      <PromptBarCompactSelect
                        ariaLabel={t('formats')}
                        isDisabled={busy}
                        onChange={(next) => {
                          const option = FORMAT_OPTIONS.find(
                            (candidate) => formatsKey(candidate) === next,
                          );
                          if (option) setFormats(option);
                        }}
                        options={FORMAT_OPTIONS.map((option) => ({
                          label: option.map((format) => t(format)).join(' + '),
                          value: formatsKey(option),
                        }))}
                        value={formatsKey(formats)}
                      />
                      <PromptBarCompactSelect
                        ariaLabel={t('ideaCount')}
                        isDisabled={busy}
                        onChange={(next) => setCount(Number(next))}
                        options={COUNT_OPTIONS.map((option) => ({
                          label: t('presets.ideas', { count: option }),
                          value: String(option),
                        }))}
                        value={String(count)}
                      />
                    </>
                  ) : isWorkflowEnabled && workflows.length > 0 ? (
                    <Select
                      disabled={busy}
                      onValueChange={setWorkflowId}
                      value={workflowId}
                    >
                      <SelectTrigger
                        aria-label={t('workflow')}
                        className={ghostSelectTriggerClassName}
                      >
                        <SelectValue placeholder={t('chooseWorkflow')} />
                      </SelectTrigger>
                      <SelectContent>
                        {workflows.map((workflow) => (
                          <SelectItem key={workflow.id} value={workflow.id}>
                            {workflow.label || workflow.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                </>
              }
              trailing={
                <PromptBarSendButton
                  ariaLabel={t('create')}
                  isDisabled={busy || !canCreate}
                  isLoading={busy}
                  onClick={() => void create()}
                  tooltip={t('create')}
                />
              }
            />
          </PromptBarComposer>
        </PromptBarContainer>
      </div>
    </div>
  );
}
