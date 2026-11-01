'use client';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant, TurboProjectKind } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  resolveOrganizationModulePresentationAccess,
} from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  getJsonApiErrorMember,
  getJsonApiErrorMessage,
} from '@services/core/json-api-error-message';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { OptionTile, OptionTileGroup } from '@ui/primitives/option-tile';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Lightbulb, Workflow } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import SubscriptionRequiredState from '@/features/workflows/components/guards/subscription/SubscriptionRequiredState';
import {
  createWorkflowApiService,
  type WorkflowSummary,
} from '@/features/workflows/services/workflow-api';
import { useFeatureFlagContext } from '@/hooks/feature-flags/provider';
import { useFeatureFlag } from '@/hooks/feature-flags/use-feature-flag';
import { createTurboProjectsApi } from './turbo-projects-api';

export default function TurboNewProjectPage() {
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
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubscriptionRequired, setIsSubscriptionRequired] = useState(false);
  const [loading, setLoading] = useState(true);
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
  async function create() {
    if (
      !brandId ||
      busy ||
      submitting.current ||
      isSubscriptionRequired ||
      (kind === TurboProjectKind.IDEAS && !isIdeasEnabled) ||
      (kind === TurboProjectKind.WORKFLOW &&
        (!isWorkflowEnabled ||
          loading ||
          !workflows.some((workflow) => workflow.id === workflowId)))
    )
      return;
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
        name: name.trim() || t('untitled'),
        ...(kind === TurboProjectKind.WORKFLOW ? { workflowId } : {}),
      });
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
      <Container label={t('new')}>
        <SubscriptionRequiredState
          message={error ?? t('saveFailed')}
          manageHref={orgHref(APP_ROUTES.SETTINGS.SUBSCRIPTION)}
          manageLabel={t('manageSubscription')}
        />
      </Container>
    );
  }
  return (
    <Container label={t('new')}>
      <div className="flex max-w-2xl flex-col gap-6">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t('source')}</legend>
          <OptionTileGroup
            ariaLabel={t('source')}
            className="sm:grid-cols-2"
            columns={1}
            onValueChange={(nextKind) => {
              setKind(nextKind);
              setError(null);
            }}
            value={kind}
          >
            <OptionTile
              ariaLabel={t('fromIdeas')}
              description={t('ideasDescription')}
              icon={
                <Lightbulb
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
              }
              isDisabled={!isIdeasEnabled || busy}
              size="lg"
              title={t('fromIdeas')}
              value={TurboProjectKind.IDEAS}
            />
            <OptionTile
              ariaLabel={t('fromWorkflow')}
              description={t('workflowDescription')}
              icon={
                <Workflow
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
              }
              isDisabled={!isWorkflowEnabled || busy}
              size="lg"
              title={t('fromWorkflow')}
              value={TurboProjectKind.WORKFLOW}
            />
          </OptionTileGroup>
        </fieldset>
        {!isWorkflowEnabled && (
          <p className="text-sm text-muted-foreground">
            {t(
              automationAccess.reason === 'subscription-required'
                ? 'workflowSubscriptionRequired'
                : automationAccess.reason === 'unavailable'
                  ? 'workflowUnavailable'
                  : 'workflowDisabled',
            )}{' '}
            <Link
              href={orgHref(
                automationAccess.reason === 'subscription-required'
                  ? APP_ROUTES.SETTINGS.SUBSCRIPTION
                  : APP_ROUTES.SETTINGS.GENERAL,
              )}
              className="underline underline-offset-4"
            >
              {t(
                automationAccess.reason === 'subscription-required'
                  ? 'manageSubscription'
                  : 'manageModules',
              )}
            </Link>
          </p>
        )}
        {!isIdeasEnabled && <p>{t('ideasDisabled')}</p>}
        <Field label={t('name')}>
          <Input
            aria-label={t('name')}
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        {kind === TurboProjectKind.WORKFLOW &&
          isWorkflowEnabled &&
          (loading ? (
            <p>{t('loading')}</p>
          ) : workflows.length ? (
            <Field label={t('workflow')}>
              <Select value={workflowId} onValueChange={setWorkflowId}>
                <SelectTrigger aria-label={t('workflow')}>
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
            </Field>
          ) : (
            <div>
              <p>{t('noWorkflows')}</p>
              <Button asChild variant={ButtonVariant.LINK}>
                <Link href={href(APP_ROUTES.AUTOMATION.WORKFLOWS)}>
                  {t('createWorkflow')}
                </Link>
              </Button>
              {isIdeasEnabled && (
                <Button
                  variant={ButtonVariant.SECONDARY}
                  onClick={() => setKind(TurboProjectKind.IDEAS)}
                >
                  {t('fromIdeas')}
                </Button>
              )}
            </div>
          ))}
        {error && <p role="alert">{error}</p>}
        <Button
          isDisabled={
            !brandId ||
            (kind === TurboProjectKind.WORKFLOW
              ? !isWorkflowEnabled ||
                loading ||
                !workflows.some((workflow) => workflow.id === workflowId)
              : !isIdeasEnabled)
          }
          isLoading={busy}
          onClick={() => void create()}
        >
          {t('create')}
        </Button>
      </div>
    </Container>
  );
}
