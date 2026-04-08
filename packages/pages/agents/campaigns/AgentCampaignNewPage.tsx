'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { ICreateAgentCampaignDto } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useAgentStrategies } from '@hooks/data/agent-strategies/use-agent-strategies';
import { AgentCampaignsService } from '@services/automation/agent-campaigns.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Textarea from '@ui/inputs/textarea/Textarea';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { HiOutlineRectangleGroup } from 'react-icons/hi2';

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
          agents:
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
        router.push('/orchestration/campaigns');
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
      label="New Campaign"
      description="Coordinate agents for content production."
      icon={HiOutlineRectangleGroup}
    >
      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        <div className="space-y-1.5">
          <label
            htmlFor="agent-campaign-label"
            className="text-sm font-medium text-foreground"
          >
            Campaign Label *
          </label>
          <Input
            id="agent-campaign-label"
            value={form.label}
            onChange={(e) => handleChange('label', e.target.value)}
            placeholder="e.g. Q1 Product Launch"
            required
          />
        </div>

        <Textarea
          label="Brief"
          value={form.brief}
          onChange={(e) => handleChange('brief', e.target.value)}
          placeholder="Describe the campaign goals and context..."
          rows={3}
        />

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Status</label>
          <Select
            value={form.status}
            onValueChange={(value) =>
              handleChange('status', value as 'draft' | 'active')
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="agent-campaign-start-date"
              className="text-sm font-medium text-foreground"
            >
              Start Date *
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
              End Date (optional)
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
            Credits Allocated
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
            Agent Strategies
          </p>
          {strategies.length === 0 ? (
            <p className="text-sm text-foreground/50">
              No agent strategies available. Create agents first.
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
            label="Create Campaign"
            type="submit"
            variant={ButtonVariant.DEFAULT}
            isDisabled={isSubmitting}
          />
          <Button
            label="Cancel"
            type="button"
            variant={ButtonVariant.SECONDARY}
            onClick={() => router.push('/orchestration/campaigns')}
          />
        </div>
      </form>
    </Container>
  );
}
