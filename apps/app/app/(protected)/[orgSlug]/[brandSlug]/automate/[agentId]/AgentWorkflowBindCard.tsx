'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { AgentStrategy } from '@services/automation/agent-strategies.service';
import { AgentStrategiesService } from '@services/automation/agent-strategies.service';
import { WorkflowsService } from '@services/automation/workflows.service';
import { logger } from '@services/core/logger.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

const CLEAR_BINDING = '__clear__';

type WorkflowOption = {
  id: string;
  label: string;
};

type Props = {
  agentId: string;
  onBound: () => Promise<void> | void;
  strategy: AgentStrategy;
};

export default function AgentWorkflowBindCard({
  agentId,
  onBound,
  strategy,
}: Props) {
  const getAgentService = useAuthedService((token: string) =>
    AgentStrategiesService.getInstance(token),
  );
  const getWorkflowsService = useAuthedService((token: string) =>
    WorkflowsService.getInstance(token),
  );

  const [options, setOptions] = useState<WorkflowOption[]>([]);
  const [selectedId, setSelectedId] = useState(
    strategy.preferredWorkflowId ?? '',
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSelectedId(strategy.preferredWorkflowId ?? '');
  }, [strategy.preferredWorkflowId]);

  useEffect(() => {
    let cancelled = false;
    async function loadWorkflows() {
      setIsLoading(true);
      try {
        const service = await getWorkflowsService();
        const brandId = strategy.brandId ?? strategy.brand?.id;
        const rows = await service.findAll(
          brandId
            ? { brandId, isDeleted: false, limit: 50 }
            : { isDeleted: false, limit: 50 },
        );
        if (cancelled) {
          return;
        }
        setOptions(
          rows.map((workflow) => ({
            id: workflow.id,
            label:
              (typeof workflow.label === 'string' && workflow.label.trim()) ||
              workflow.id.slice(0, 8),
          })),
        );
      } catch (error) {
        if (!cancelled) {
          logger.error('Failed to list workflows for agent bind', error);
          toast.error('Could not load workflows');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }
    void loadWorkflows();
    return () => {
      cancelled = true;
    };
  }, [getWorkflowsService, strategy.brand?.id, strategy.brandId]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const service = await getAgentService();
      const nextId =
        !selectedId || selectedId === CLEAR_BINDING ? '' : selectedId;
      // Empty string is treated as unbound by readConfigString (trim falsy).
      await service.update(agentId, {
        preferredWorkflowId: nextId,
      });
      toast.success(
        nextId ? 'Workflow bound to agent' : 'Workflow binding cleared',
      );
      await onBound();
    } catch (error) {
      logger.error('Failed to bind workflow to agent', error);
      toast.error(
        error instanceof Error ? error.message : 'Could not save binding',
      );
    } finally {
      setIsSaving(false);
    }
  }, [agentId, getAgentService, onBound, selectedId]);

  const currentTemplate = strategy.preferredWorkflowTemplateId;

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            Bound workflow
          </h3>
          <p className="text-xs text-foreground/55">
            Deterministic Run workflow uses this graph. Hire presets seed a
            template when empty; pick a workflow to pin one permanently.
          </p>
          {currentTemplate && !strategy.preferredWorkflowId ? (
            <p className="text-xs text-foreground/50">
              Template default:{' '}
              <span className="font-medium text-foreground">
                {currentTemplate}
              </span>
            </p>
          ) : null}
          <Select
            value={selectedId || CLEAR_BINDING}
            onValueChange={setSelectedId}
            disabled={isLoading || isSaving}
          >
            <SelectTrigger aria-label="Select workflow to bind">
              <SelectValue
                placeholder={
                  isLoading ? 'Loading workflows…' : 'Select a workflow'
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CLEAR_BINDING}>
                Use template default / unbound
              </SelectItem>
              {options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          label={isSaving ? 'Saving…' : 'Save binding'}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          disabled={isLoading || isSaving}
          onClick={() => void handleSave()}
        />
      </div>
    </Card>
  );
}
