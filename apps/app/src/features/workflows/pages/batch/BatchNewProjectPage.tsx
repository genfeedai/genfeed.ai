'use client';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { BatchProjectKind, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useFastlaneEnabled } from '@hooks/data/organization/use-fastlane-enabled/use-fastlane-enabled';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
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
  const { brandId } = useBrand();
  const { href } = useOrgUrl();
  const router = useRouter();
  const flag = useFastlaneEnabled();
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
  const [kind, setKind] = useState(BatchProjectKind.WORKFLOW);
  const [workflowId, setWorkflowId] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setWorkflowId('');
    setError(null);
    setLoading(true);
    void getWorkflows()
      .then((service) => service.list({ brandId }))
      .then((items) => {
        if (!controller.signal.aborted)
          setWorkflowResult({ scope: workflowScope, items });
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : t('loadFailed'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [getWorkflows, brandId, t, workflowScope]);
  async function create() {
    if (
      !brandId ||
      busy ||
      (kind === BatchProjectKind.WORKFLOW &&
        (loading || !workflows.some((workflow) => workflow.id === workflowId)))
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
      setError(reason instanceof Error ? reason.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Container label={t('new')}>
      <div className="flex max-w-2xl flex-col gap-6">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={
              kind === BatchProjectKind.IDEAS
                ? ButtonVariant.DEFAULT
                : ButtonVariant.SECONDARY
            }
            isDisabled={!flag.isEnabled || flag.isLoading || busy}
            onClick={() => setKind(BatchProjectKind.IDEAS)}
          >
            {t('fromIdeas')}
          </Button>
          <Button
            variant={
              kind === BatchProjectKind.WORKFLOW
                ? ButtonVariant.DEFAULT
                : ButtonVariant.SECONDARY
            }
            isDisabled={busy}
            onClick={() => setKind(BatchProjectKind.WORKFLOW)}
          >
            {t('fromWorkflow')}
          </Button>
        </div>
        {!flag.isLoading && !flag.isEnabled && <p>{t('ideasDisabled')}</p>}
        <Field label={t('name')}>
          <Input
            aria-label={t('name')}
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        {kind === BatchProjectKind.WORKFLOW &&
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
              {flag.isEnabled && (
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
              ? loading ||
                !workflows.some((workflow) => workflow.id === workflowId)
              : !flag.isEnabled)
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
