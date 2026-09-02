'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import {
  AGENT_PROGRAM_TEMPLATES,
  APP_ROUTES,
  getAgentProgramTemplate,
} from '@genfeedai/contracts/constants';
import type { ICreateAgentCampaignDto } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useAgentStrategies } from '@hooks/data/agent-strategies/use-agent-strategies';
import {
  isBrandResourceReady,
  toBrandListParams,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { AgentCampaignsService } from '@services/automation/agent-campaigns.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQueryClient } from '@tanstack/react-query';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import { Textarea } from '@ui/primitives/textarea';
import { FileText, LayoutDashboard, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

interface FormState {
  brief: string;
  creditsAllocated: string;
  endDate: string;
  label: string;
  selectedAgentIds: string[];
  startDate: string;
}

function createInitialForm(templateId?: string): FormState {
  const template = templateId ? getAgentProgramTemplate(templateId) : undefined;

  return {
    brief: template?.description ?? '',
    creditsAllocated: '0',
    endDate: '',
    label: template ? `${template.label} Program` : '',
    selectedAgentIds: [],
    startDate: '',
  };
}

function ProgramTemplatePicker({
  onSelect,
  selectedTemplateId,
}: {
  onSelect: (templateId?: string) => void;
  selectedTemplateId?: string;
}) {
  const translate = useTranslations('common.agentCampaign');

  return (
    <div className="space-y-2">
      <div>
        <h2 className="text-sm font-medium text-foreground">
          {translate('template.title')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {translate('template.description')}
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Button
          aria-pressed={!selectedTemplateId}
          className={`w-full rounded p-4 text-left transition-colors ${
            selectedTemplateId
              ? 'shadow-border hover:shadow-border-strong'
              : 'bg-tertiary shadow-border-strong'
          }`}
          type="button"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          onClick={() => onSelect()}
        >
          <span className="flex items-start gap-3">
            <FileText className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="block text-sm font-medium">
                {translate('template.blankLabel')}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {translate('template.blankDescription')}
              </span>
            </span>
          </span>
        </Button>

        {AGENT_PROGRAM_TEMPLATES.map((template) => {
          const isSelected = selectedTemplateId === template.id;

          return (
            <Button
              key={template.id}
              aria-pressed={isSelected}
              className={`w-full rounded p-4 text-left transition-colors ${
                isSelected
                  ? 'bg-tertiary shadow-border-strong'
                  : 'shadow-border hover:shadow-border-strong'
              }`}
              type="button"
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={() => onSelect(template.id)}
            >
              <span className="flex items-start gap-3">
                <Users className="mt-0.5 size-4 shrink-0" />
                <span>
                  <span className="block text-sm font-medium">
                    {template.label}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {translate('template.createsAgents', {
                      count: template.roles.length,
                      roles: template.roles
                        .map((role) => role.displayRole)
                        .join(', '),
                    })}
                  </span>
                </span>
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export default function AgentCampaignNewPage() {
  const translate = useTranslations('common.agentCampaign');
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { href } = useOrgUrl();
  const notificationsService = NotificationsService.getInstance();
  const requestedTemplateId = searchParams.get('template') ?? undefined;
  const initialTemplateId = getAgentProgramTemplate(
    requestedTemplateId ?? '',
  )?.id;
  const [selectedTemplateId, setSelectedTemplateId] = useState<
    string | undefined
  >(initialTemplateId);
  const [form, setForm] = useState<FormState>(() =>
    createInitialForm(initialTemplateId),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const collectionScope = useCollectionScope();
  const { brandId, pageScope } = collectionScope;
  const isBrandReady = isBrandResourceReady(collectionScope);
  const { strategies } = useAgentStrategies({
    ...toBrandListParams({ brandId }),
    enabled: isBrandReady,
  });
  const selectedTemplate = useMemo(
    () =>
      selectedTemplateId
        ? getAgentProgramTemplate(selectedTemplateId)
        : undefined,
    [selectedTemplateId],
  );

  const getService = useAuthedService((token: string) =>
    AgentCampaignsService.getInstance(token),
  );

  const handleChange = useCallback((field: keyof FormState, value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }));
  }, []);

  const handleTemplateSelect = useCallback((templateId?: string) => {
    setSelectedTemplateId(templateId);
    const template = templateId
      ? getAgentProgramTemplate(templateId)
      : undefined;

    setForm((previous) => ({
      ...previous,
      brief:
        previous.brief.trim().length > 0
          ? previous.brief
          : (template?.description ?? ''),
      label:
        previous.label.trim().length > 0
          ? previous.label
          : template
            ? `${template.label} Program`
            : '',
    }));
  }, []);

  const toggleAgent = useCallback((agentId: string) => {
    setForm((previous) => ({
      ...previous,
      selectedAgentIds: previous.selectedAgentIds.includes(agentId)
        ? previous.selectedAgentIds.filter((id) => id !== agentId)
        : [...previous.selectedAgentIds, agentId],
    }));
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!isBrandReady || !brandId) {
        notificationsService.error(
          pageScope === 'org'
            ? 'Select a brand to create a Program'
            : 'Wait for the selected brand to load',
        );
        return;
      }
      if (!form.label.trim()) {
        notificationsService.error('Program label is required');
        return;
      }
      if (!form.startDate) {
        notificationsService.error('Start date is required');
        return;
      }
      if (!selectedTemplate && form.selectedAgentIds.length === 0) {
        notificationsService.error(
          'Select at least one agent for a blank Program',
        );
        return;
      }

      setIsSubmitting(true);

      try {
        const service = await getService();
        const payload: ICreateAgentCampaignDto = {
          agentStrategyIds:
            form.selectedAgentIds.length > 0
              ? form.selectedAgentIds
              : undefined,
          brief: form.brief.trim() || undefined,
          brandId,
          creditsAllocated: Number(form.creditsAllocated) || 0,
          endDate: form.endDate || undefined,
          label: form.label.trim(),
          startDate: form.startDate,
          status: 'draft',
        };

        const created = selectedTemplate
          ? await service.createFromTemplate({
              agentStrategyIds: payload.agentStrategyIds,
              brief: payload.brief,
              brandId,
              creditsAllocated: payload.creditsAllocated,
              endDate: payload.endDate,
              label: payload.label,
              startDate: payload.startDate,
              templateId: selectedTemplate.id,
            })
          : await service.create(payload);

        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ['agent-campaigns', brandId],
          }),
          queryClient.invalidateQueries({
            queryKey: ['agent-strategies', brandId],
          }),
        ]);

        notificationsService.success('Program created successfully');
        router.push(href(`${APP_ROUTES.AUTOMATION.CAMPAIGNS}/${created.id}`));
      } catch (error) {
        logger.error('Failed to create agent Program', { error });
        notificationsService.error('Failed to create Program');
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      brandId,
      form,
      getService,
      href,
      isBrandReady,
      notificationsService,
      pageScope,
      queryClient,
      router,
      selectedTemplate,
    ],
  );

  if (!isBrandReady || !brandId) {
    return (
      <Container
        description="Coordinate agents for content production."
        icon={LayoutDashboard}
        label="New Program"
      >
        <p className="text-sm text-muted-foreground">
          {translate(pageScope === 'org' ? 'selectBrand' : 'loadingBrand')}
        </p>
      </Container>
    );
  }

  return (
    <Container
      description="Coordinate agents for content production."
      icon={LayoutDashboard}
      label="New Program"
    >
      <form className="max-w-3xl space-y-6" onSubmit={handleSubmit}>
        <ProgramTemplatePicker
          selectedTemplateId={selectedTemplateId}
          onSelect={handleTemplateSelect}
        />

        <div className="space-y-1.5">
          <Label htmlFor="agent-campaign-label">
            {translate('campaignLabel')}
          </Label>
          <Input
            id="agent-campaign-label"
            placeholder="e.g. Q1 Product Launch"
            required
            value={form.label}
            onChange={(event) => handleChange('label', event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="agent-campaign-brief">{translate('brief')}</Label>
          <Textarea
            id="agent-campaign-brief"
            placeholder="Describe the Program goals and context..."
            rows={3}
            value={form.brief}
            onChange={(event) => handleChange('brief', event.target.value)}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="agent-campaign-start-date">
              {translate('startDate')}
            </Label>
            <Input
              id="agent-campaign-start-date"
              required
              type="date"
              value={form.startDate}
              onChange={(event) =>
                handleChange('startDate', event.target.value)
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent-campaign-end-date">
              {translate('endDate')}
            </Label>
            <Input
              id="agent-campaign-end-date"
              type="date"
              value={form.endDate}
              onChange={(event) => handleChange('endDate', event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="agent-campaign-credits">
            {translate('creditsAllocated')}
          </Label>
          <Input
            id="agent-campaign-credits"
            min={0}
            placeholder="0"
            type="number"
            value={form.creditsAllocated}
            onChange={(event) =>
              handleChange('creditsAllocated', event.target.value)
            }
          />
        </div>

        <div className="space-y-2">
          <div>
            <p className="text-sm font-medium text-foreground">
              {translate('agents.existingTitle')}
            </p>
            <p className="text-xs text-muted-foreground">
              {translate('agents.existingDescription')}
            </p>
          </div>
          {strategies.length === 0 ? (
            <p className="rounded border border-border p-3 text-sm text-muted-foreground">
              {translate('agents.noneForBrand')}{' '}
              <Link
                className="text-foreground underline underline-offset-2"
                href={href(`${APP_ROUTES.AUTOMATION.AGENTS}?add=library`)}
              >
                {translate('agents.add')}
              </Link>
              .
            </p>
          ) : (
            <>
              <div className="space-y-2 rounded border border-border p-3">
                {strategies.map((strategy) => {
                  const checkboxId = `agent-campaign-strategy-${strategy.id}`;

                  return (
                    <div className="flex items-center gap-3" key={strategy.id}>
                      <Checkbox
                        aria-label={`Select ${strategy.label}`}
                        checked={form.selectedAgentIds.includes(strategy.id)}
                        id={checkboxId}
                        onCheckedChange={() => toggleAgent(strategy.id)}
                      />
                      <Label
                        className="min-w-0 cursor-pointer"
                        htmlFor={checkboxId}
                      >
                        <span className="text-sm font-medium">
                          {strategy.label}
                        </span>
                        <span className="ml-2 text-xs uppercase tracking-wide text-muted-foreground">
                          {strategy.agentType}
                        </span>
                      </Label>
                    </div>
                  );
                })}
              </div>
              {!selectedTemplate && form.selectedAgentIds.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {translate('template.selectionRequired')}
                </p>
              ) : null}
            </>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {translate('draftNotice')}
        </p>

        <div className="flex items-center gap-3 pt-2">
          <Button
            isDisabled={
              isSubmitting ||
              (!selectedTemplate && form.selectedAgentIds.length === 0)
            }
            label={isSubmitting ? 'Creating…' : 'Create Program'}
            type="submit"
            variant={ButtonVariant.DEFAULT}
          />
          <Button
            isDisabled={isSubmitting}
            label="Cancel"
            type="button"
            variant={ButtonVariant.SECONDARY}
            onClick={() => router.push(href(APP_ROUTES.AUTOMATION.CAMPAIGNS))}
          />
        </div>
      </form>
    </Container>
  );
}
