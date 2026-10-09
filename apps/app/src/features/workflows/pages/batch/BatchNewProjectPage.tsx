'use client';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { BatchProjectKind, ButtonVariant } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  resolveOrganizationModulePreferences,
} from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useFeatureFlag } from '@hooks/feature-flags/use-feature-flag';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  getJsonApiErrorMember,
  getJsonApiErrorMessage,
} from '@services/core/json-api-error-message';
import SubscriptionRequiredState from '@ui/guards/subscription/SubscriptionRequiredState';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
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
import { useEffect, useMemo, useState } from 'react';
import {
  createWorkflowApiService,
  type WorkflowSummary,
} from '@/features/workflows/services/workflow-api';
import { createBatchProjectsApi } from './batch-projects-api';

export default function BatchNewProjectPage() {
  const t = useTranslations('pages.batchProjects');
  const { brandId, settings, settingsLoading } = useBrand();
  const isWorkflowEnabled =
    resolveOrganizationModulePreferences(settingsLoading ? null : settings)
      ?.automation === true;
  const { href, orgHref } = useOrgUrl();
  const router = useRouter();
  const isIdeasEnabled = useFeatureFlag('batch_ideas');
  const getService = useAuthedService(createBatchProjectsApi);
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
    isIdeasEnabled ? BatchProjectKind.IDEAS : BatchProjectKind.WORKFLOW,
  );
  const [workflowId, setWorkflowId] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubscriptionRequired, setIsSubscriptionRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setWorkflowId('');
    setError(null);
    setIsSubscriptionRequired(false);
    setLoading(true);
    if (!brandId || kind !== BatchProjectKind.WORKFLOW || !isWorkflowEnabled) {
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
      isSubscriptionRequired ||
      (kind === BatchProjectKind.IDEAS && !isIdeasEnabled) ||
      (kind === BatchProjectKind.WORKFLOW &&
        (!isWorkflowEnabled ||
          loading ||
          !workflows.some((workflow) => workflow.id === workflowId)))
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const project = await (await getService()).create({
        brandId,
        kind,
        name: name.trim() || t('untitled'),
        ...(kind === BatchProjectKind.WORKFLOW ? { workflowId } : {}),
      });
      router.push(href(`${APP_ROUTES.STUDIO.BATCH}/${project.id}`));
    } catch (reason) {
      const member = getJsonApiErrorMember(reason);
      setIsSubscriptionRequired(
        member?.status === 403 &&
          member.title === 'Active subscription required',
      );
      setError(getJsonApiErrorMessage(reason, t('saveFailed')));
    } finally {
      setBusy(false);
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              aria-label={t('fromIdeas')}
              aria-pressed={kind === BatchProjectKind.IDEAS}
              isDisabled={!isIdeasEnabled || busy}
              onClick={() => {
                setKind(BatchProjectKind.IDEAS);
                setError(null);
              }}
              className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left ${kind === BatchProjectKind.IDEAS ? 'border-primary bg-primary/10' : 'border-border bg-secondary hover:border-primary/60'}`}
            >
              <Lightbulb
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              <span className="min-w-0 whitespace-normal">
                <span className="block font-medium">{t('fromIdeas')}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {t('ideasDescription')}
                </span>
              </span>
            </Button>
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              aria-label={t('fromWorkflow')}
              aria-pressed={kind === BatchProjectKind.WORKFLOW}
              isDisabled={!isWorkflowEnabled || busy}
              onClick={() => {
                setKind(BatchProjectKind.WORKFLOW);
                setError(null);
              }}
              className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left ${kind === BatchProjectKind.WORKFLOW ? 'border-primary bg-primary/10' : 'border-border bg-secondary hover:border-primary/60'}`}
            >
              <Workflow aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 whitespace-normal">
                <span className="block font-medium">{t('fromWorkflow')}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {t('workflowDescription')}
                </span>
              </span>
            </Button>
          </div>
        </fieldset>
        {!isWorkflowEnabled && (
          <p className="text-sm text-muted-foreground">
            {t('workflowDisabled')}{' '}
            <Link
              href={orgHref(APP_ROUTES.SETTINGS.GENERAL)}
              className="underline underline-offset-4"
            >
              {t('manageModules')}
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
        {kind === BatchProjectKind.WORKFLOW &&
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
                  onClick={() => setKind(BatchProjectKind.IDEAS)}
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
            (kind === BatchProjectKind.WORKFLOW
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
