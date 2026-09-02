'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { AgentStrategy } from '@services/automation/agent-strategies.service';
import { AgentStrategiesService } from '@services/automation/agent-strategies.service';
import { WorkflowsService } from '@services/automation/workflows.service';
import { logger } from '@services/core/logger.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

const CLEAR_BINDING = '__clear__';

type WorkflowOption = {
  id: string;
  label: string;
};

type OverrideRow = {
  id: string;
  key: string;
  value: string;
};

type Props = {
  agentId: string;
  onBound: () => Promise<void> | void;
  strategy: AgentStrategy;
};

function newOverrideRow(key = '', value = ''): OverrideRow {
  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `ovr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    key,
    value,
  };
}

function overridesFromStrategy(strategy: AgentStrategy): OverrideRow[] {
  const rows = strategy.workflowInputOverrides;
  if (!Array.isArray(rows) || rows.length === 0) {
    return [newOverrideRow()];
  }
  return rows.map((row) =>
    newOverrideRow(String(row.key ?? ''), String(row.value ?? '')),
  );
}

export default function AgentWorkflowBindCard({
  agentId,
  onBound,
  strategy,
}: Props) {
  const translate = useTranslations('common.automation.workflowBinding');
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
  const [overrides, setOverrides] = useState<OverrideRow[]>(() =>
    overridesFromStrategy(strategy),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSelectedId(strategy.preferredWorkflowId ?? '');
    setOverrides(overridesFromStrategy(strategy));
  }, [strategy]);

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
          toast.error(translate('errors.load'));
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
  }, [getWorkflowsService, strategy.brand?.id, strategy.brandId, translate]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const service = await getAgentService();
      const nextId =
        !selectedId || selectedId === CLEAR_BINDING ? '' : selectedId;
      const workflowInputOverrides = overrides
        .map((row) => ({
          key: row.key.trim(),
          value: row.value.trim(),
        }))
        .filter((row) => row.key.length > 0 && row.value.length > 0)
        .map((row) => ({
          key: row.key,
          value: row.value as string | number | boolean,
        }));

      // Empty preferredWorkflowId is treated as unbound by readConfigString.
      await service.update(agentId, {
        preferredWorkflowId: nextId,
        workflowInputOverrides,
      });
      toast.success(
        nextId
          ? translate('notifications.saved')
          : translate('notifications.cleared'),
      );
      await onBound();
    } catch (error) {
      logger.error('Failed to bind workflow to agent', error);
      toast.error(
        error instanceof Error ? error.message : translate('errors.save'),
      );
    } finally {
      setIsSaving(false);
    }
  }, [agentId, getAgentService, onBound, overrides, selectedId, translate]);

  const currentTemplate = strategy.preferredWorkflowTemplateId;

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            {translate('title')}
          </h3>
          <p className="text-xs text-foreground/55">
            {translate('description')}
          </p>
          {currentTemplate && !strategy.preferredWorkflowId ? (
            <p className="text-xs text-foreground/50">
              {translate('templateDefault')}{' '}
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
                {translate('unbound')}
              </SelectItem>
              {options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2 border-t border-foreground/10 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-medium text-foreground">
              {translate('overrides.title')}
            </h4>
            <p className="text-xs text-foreground/50">
              {translate('overrides.description')}
            </p>
          </div>
          <Button
            label="Add row"
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            disabled={isSaving}
            onClick={() => setOverrides((prev) => [...prev, newOverrideRow()])}
          />
        </div>
        <div className="space-y-2">
          {overrides.map((row, index) => (
            <div
              key={row.id}
              className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]"
            >
              <Input
                aria-label={`Override key ${index + 1}`}
                placeholder="slot key (e.g. topic)"
                value={row.key}
                onChange={(event) =>
                  setOverrides((prev) =>
                    prev.map((item) =>
                      item.id === row.id
                        ? { ...item, key: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <Input
                aria-label={`Override value ${index + 1}`}
                placeholder="value"
                value={row.value}
                onChange={(event) =>
                  setOverrides((prev) =>
                    prev.map((item) =>
                      item.id === row.id
                        ? { ...item, value: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <Button
                label="Remove"
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
                disabled={isSaving || overrides.length <= 1}
                onClick={() =>
                  setOverrides((prev) =>
                    prev.length <= 1
                      ? [newOverrideRow()]
                      : prev.filter((item) => item.id !== row.id),
                  )
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          label={isSaving ? 'Saving…' : 'Save binding'}
          size={ButtonSize.SM}
          variant={ButtonVariant.DEFAULT}
          disabled={isLoading || isSaving}
          onClick={() => void handleSave()}
        />
      </div>
    </Card>
  );
}
