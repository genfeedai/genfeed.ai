'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import type { ICreateAgentCampaignDto } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useAgentStrategies } from '@hooks/data/agent-strategies/use-agent-strategies';
import { AgentCampaignsService } from '@services/automation/agent-campaigns.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { LayoutDashboard } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

interface FormState {
  label: string;
  brief: string;
  status: 'draft' | 'active';
  startDate: string;
  endDate: string;
  creditsAllocated: string;
  selectedAgentIds: string[];
}

const INITIAL_FORM: FormState = {
  brief: '',
  creditsAllocated: '0',
  endDate: '',
  label: '',
  selectedAgentIds: [],
  startDate: '',
  status: 'draft',
};

export default function AgentCampaignNewPage() {
  const translate = useTranslations('common.agentCampaign');
  const router = useRouter();
  const notificationsService = NotificationsService.getInstance();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { strategies } = useAgentStrategies();

  const getService = useAuthedService((token: string) =>
    AgentCampaignsService.getInstance(token),
  );

  const handleChange = useCallback((field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const toggleAgent = useCallback((agentId: string) => {
    setForm((prev) => {
      const isSelected = prev.selectedAgentIds.includes(agentId);
      return {
        ...prev,
        selectedAgentIds: isSelected
          ? prev.selectedAgentIds.filter((id) => id !== agentId)
          : [...prev.selectedAgentIds, agentId],
      };
    });
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!form.label.trim()) {
        notificationsService.error('Campaign label is required');
        return;
      }

      if (!form.startDate) {
        notificationsService.error('Start date is required');
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
          creditsAllocated: Number(form.creditsAllocated) || 0,
          endDate: form.endDate || undefined,
          label: form.label.trim(),
          startDate: form.startDate,
          status: form.status,
        };

        await service.create(payload);
        notificationsService.success('Campaign created successfully');
        router.push(APP_ROUTES.AUTOMATE.CAMPAIGNS);
      } catch (error) {
        logger.error('Failed to create agent campaign', { error });
        notificationsService.error('Failed to create campaign');
      } finally {
        setIsSubmitting(false);
      }
    },
    [form, getService, notificationsService, router],
  );

  return (
    <Container
      label="New Program"
      description="Coordinate agents for content production."
      icon={LayoutDashboard}
    >
      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        <div className="space-y-1.5">
          <label
            htmlFor="agent-campaign-label"
            className="text-sm font-medium text-foreground"
          >
            {translate('campaignLabel')}
          </label>
          <Input
            id="agent-campaign-label"
            value={form.label}
            onChange={(e) => handleChange('label', e.target.value)}
            placeholder="e.g. Q1 Product Launch"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="agent-campaign-brief"
            className="text-sm font-medium text-foreground"
          >
            {translate('brief')}
          </Label>
          <Textarea
            id="agent-campaign-brief"
            value={form.brief}
            onChange={(e) => handleChange('brief', e.target.value)}
            placeholder="Describe the campaign goals and context..."
            rows={3}
          />
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            {translate('status.label')}
          </span>
          <Select
            value={form.status}
            onValueChange={(value) =>
              handleChange('status', value as 'draft' | 'active')
            }
          >
            <SelectTrigger aria-label="Status">
              <SelectValue placeholder="Select a status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">{translate('status.draft')}</SelectItem>
              <SelectItem value="active">
                {translate('status.active')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="agent-campaign-start-date"
              className="text-sm font-medium text-foreground"
            >
              {translate('startDate')}
            </label>
            <Input
              id="agent-campaign-start-date"
              type="date"
              value={form.startDate}
              onChange={(e) => handleChange('startDate', e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="agent-campaign-end-date"
              className="text-sm font-medium text-foreground"
            >
              {translate('endDate')}
            </label>
            <Input
              id="agent-campaign-end-date"
              type="date"
              value={form.endDate}
              onChange={(e) => handleChange('endDate', e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="agent-campaign-credits"
            className="text-sm font-medium text-foreground"
          >
            {translate('creditsAllocated')}
          </label>
          <Input
            id="agent-campaign-credits"
            type="number"
            min={0}
            value={form.creditsAllocated}
            onChange={(e) => handleChange('creditsAllocated', e.target.value)}
            placeholder="0"
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            {translate('agentStrategies')}
          </p>
          {strategies.length === 0 ? (
            <p className="text-sm text-foreground/50">
              {translate('noAgentStrategies')}
            </p>
          ) : (
            <div className="space-y-2 rounded border border-input p-3">
              {strategies.map((strategy) => (
                <label
                  key={strategy.id}
                  className="flex items-center gap-3 cursor-pointer"
                >
                  <Checkbox
                    checked={form.selectedAgentIds.includes(strategy.id)}
                    onCheckedChange={() => toggleAgent(strategy.id)}
                    aria-label={`Select ${strategy.label}`}
                  />
                  <div>
                    <span className="text-sm font-medium">
                      {strategy.label}
                    </span>
                    <span className="ml-2 text-xs text-foreground/50 uppercase tracking-wide">
                      {strategy.agentType}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button
            label="Create Program"
            type="submit"
            variant={ButtonVariant.DEFAULT}
            isDisabled={isSubmitting}
          />
          <Button
            label="Cancel"
            type="button"
            variant={ButtonVariant.SECONDARY}
            onClick={() => router.push(APP_ROUTES.AUTOMATE.CAMPAIGNS)}
          />
        </div>
      </form>
    </Container>
  );
}
