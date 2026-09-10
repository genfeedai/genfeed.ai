'use client';

import { getActionDefinition } from '@genfeedai/actions';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { ActionSchemaFields, PanelContainer } from '@genfeedai/workflows/ui';
import { useUIStore, useWorkflowStore } from '@genfeedai/workflows/ui/stores';
import { TIMEZONES } from '@helpers/formatting/timezone/timezone.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import DropdownMultiSelect from '@ui/dropdowns/multiselect/DropdownMultiSelect';
import { Button } from '@ui/primitives/button';
import { Label } from '@ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect } from 'react';
import {
  useWorkflowActionDefaults,
  useWorkflowActionScope,
} from '@/features/workflows/hooks/useWorkflowActionDefaults';

const SCOPED_FIELDS = new Set([
  'agentStrategyId',
  'brandId',
  'credentialId',
  'credentialIds',
  'minScore',
  'organizationId',
  'timezone',
  'topics',
]);

function readRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function schemaProperties(schema: object): Record<string, unknown> {
  if (!('properties' in schema)) {
    return {};
  }
  const properties = (schema as { properties?: unknown }).properties;
  return properties !== null &&
    typeof properties === 'object' &&
    !Array.isArray(properties)
    ? (properties as Record<string, unknown>)
    : {};
}

function FieldLabel({ htmlFor, label }: { htmlFor: string; label: string }) {
  return (
    <Label htmlFor={htmlFor} className="text-xs text-foreground">
      {label}
    </Label>
  );
}

export function CloudActionNodeInspector() {
  const translate = useTranslations('pages.workflows.actionInspector');
  const selectedNodeId = useUIStore((state) => state.selectedNodeId);
  const selectNode = useUIStore((state) => state.selectNode);
  const node = useWorkflowStore((state) =>
    selectedNodeId
      ? state.nodes.find((candidate) => candidate.id === selectedNodeId)
      : undefined,
  );
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const scope = useWorkflowActionScope();
  const actionParameterDefaults = useWorkflowActionDefaults();
  const data = readRecord(node?.data);
  const actionId = typeof data.actionId === 'string' ? data.actionId : '';
  const action = getActionDefinition(actionId);
  const parameters = readRecord(data.parameters);
  const properties = schemaProperties(action?.inputSchema ?? {});

  const handleChange = useCallback(
    (field: string, value: unknown) => {
      if (!node) return;
      const nextParameters = { ...parameters };
      if (
        value === undefined ||
        value === '' ||
        (Array.isArray(value) && value.length === 0)
      ) {
        delete nextParameters[field];
      } else {
        nextParameters[field] = value;
      }
      updateNodeData(node.id, {
        [field]: value,
        parameters: nextParameters,
      });
    },
    [node, parameters, updateNodeData],
  );

  useEffect(() => {
    if (!node || !action) {
      return;
    }
    const defaults = actionParameterDefaults(action.id);
    const patch: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(defaults)) {
      const current = parameters[field];
      if (current === undefined || current === '') {
        patch[field] = value;
      }
    }
    if (Object.keys(patch).length === 0) {
      return;
    }
    updateNodeData(node.id, {
      ...patch,
      parameters: { ...parameters, ...patch },
    });
  }, [action, actionParameterDefaults, node, parameters, updateNodeData]);

  if (String(node?.type) !== 'genfeedAction' || !action) {
    return null;
  }

  const timezoneValue =
    typeof parameters.timezone === 'string' && parameters.timezone
      ? parameters.timezone
      : scope.timezone;
  const strategyValue =
    typeof parameters.agentStrategyId === 'string'
      ? parameters.agentStrategyId
      : '';
  const credentialValues = Array.isArray(parameters.credentialIds)
    ? parameters.credentialIds.filter(
        (value): value is string => typeof value === 'string',
      )
    : [];
  const credentialId =
    typeof parameters.credentialId === 'string' ? parameters.credentialId : '';
  const minScore =
    typeof parameters.minScore === 'number' ? String(parameters.minScore) : '';
  const topicsValue = Array.isArray(parameters.topics)
    ? parameters.topics.filter(
        (value): value is string => typeof value === 'string',
      )
    : [];

  return (
    <PanelContainer
      role="complementary"
      aria-label={`${action.label} configuration`}
      className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-card"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {action.label}
          </h2>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {action.description}
          </p>
        </div>
        <Button
          withWrapper={false}
          type="button"
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          title={translate('close')}
          onClick={() => selectNode(null)}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {properties.brandId ? (
          <div className="space-y-1.5">
            <FieldLabel
              htmlFor="action-field-brandId"
              label={translate('brand')}
            />
            {scope.brands.length > 0 ? (
              <Select
                onValueChange={(value) => handleChange('brandId', value)}
                value={
                  (typeof parameters.brandId === 'string' &&
                    parameters.brandId) ||
                  scope.brandId ||
                  undefined
                }
              >
                <SelectTrigger
                  className="nodrag h-8 w-full"
                  id="action-field-brandId"
                >
                  <SelectValue placeholder={translate('selectBrand')} />
                </SelectTrigger>
                <SelectContent>
                  {scope.brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p
                className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground"
                id="action-field-brandId"
              >
                {scope.brandLabel}
              </p>
            )}
          </div>
        ) : null}

        {properties.credentialIds ? (
          <div className="space-y-1.5">
            <FieldLabel
              htmlFor="action-field-credentialIds"
              label={translate('accounts')}
            />
            {scope.credentials.length > 0 ? (
              <DropdownMultiSelect
                isSearchEnabled={scope.credentials.length > 6}
                name="credentialIds"
                onChange={(_name, values) =>
                  handleChange('credentialIds', values)
                }
                options={scope.credentials.map((credential) => ({
                  icon: getPlatformIcon(credential.platform, 'h-3.5 w-3.5'),
                  label: `@${credential.label.replace(/^@/, '')}`,
                  value: credential.id,
                }))}
                placeholder={translate('selectAccounts')}
                values={credentialValues}
              />
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {translate('connectAccounts')}
              </p>
            )}
          </div>
        ) : null}

        {properties.credentialId ? (
          <div className="space-y-1.5">
            <FieldLabel
              htmlFor="action-field-credentialId"
              label={translate('account')}
            />
            <Select
              onValueChange={(value) => handleChange('credentialId', value)}
              value={credentialId || undefined}
            >
              <SelectTrigger
                className="nodrag h-8 w-full"
                id="action-field-credentialId"
              >
                <SelectValue placeholder={translate('selectAccount')} />
              </SelectTrigger>
              <SelectContent>
                {scope.credentials.map((credential) => (
                  <SelectItem key={credential.id} value={credential.id}>
                    {credential.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {properties.timezone ? (
          <div className="space-y-1.5">
            <FieldLabel
              htmlFor="action-field-timezone"
              label={translate('timezone')}
            />
            <Select
              onValueChange={(value) => handleChange('timezone', value)}
              value={timezoneValue}
            >
              <SelectTrigger
                className="nodrag h-8 w-full"
                id="action-field-timezone"
              >
                <SelectValue placeholder={translate('selectTimezone')} />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((zone) => (
                  <SelectItem key={zone.value} value={zone.value}>
                    {zone.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {properties.topics ? (
          <div className="space-y-1.5">
            <FieldLabel
              htmlFor="action-field-topics"
              label={translate('topics')}
            />
            <Textarea
              className="nodrag nopan min-h-20"
              id="action-field-topics"
              onChange={(event) =>
                handleChange(
                  'topics',
                  event.target.value
                    .split('\n')
                    .map((entry) => entry.trim())
                    .filter(Boolean),
                )
              }
              placeholder={translate('topicsPlaceholder')}
              value={topicsValue.join('\n')}
            />
          </div>
        ) : null}

        {properties.minScore ? (
          <div className="space-y-1.5">
            <FieldLabel
              htmlFor="action-field-minScore"
              label={translate('minScore')}
            />
            <Select
              onValueChange={(value) => handleChange('minScore', Number(value))}
              value={minScore || undefined}
            >
              <SelectTrigger
                className="nodrag h-8 w-full"
                id="action-field-minScore"
              >
                <SelectValue placeholder={translate('minScorePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {[7, 8, 9, 10].map((score) => (
                  <SelectItem key={score} value={String(score)}>
                    {score}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {properties.agentStrategyId ? (
          <div className="space-y-1.5">
            <FieldLabel
              htmlFor="action-field-agentStrategyId"
              label={translate('strategy')}
            />
            <Select
              onValueChange={(value) =>
                handleChange(
                  'agentStrategyId',
                  value === '__none__' ? undefined : value,
                )
              }
              value={strategyValue || '__none__'}
            >
              <SelectTrigger
                className="nodrag h-8 w-full"
                id="action-field-agentStrategyId"
              >
                <SelectValue placeholder={translate('noStrategy')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  {translate('noStrategy')}
                </SelectItem>
                {scope.strategies.map((strategy) => (
                  <SelectItem key={strategy.id} value={strategy.id}>
                    {strategy.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {Object.keys(properties).some((field) => !SCOPED_FIELDS.has(field)) ? (
          <ActionSchemaFields
            hiddenFields={SCOPED_FIELDS}
            onChange={handleChange}
            schema={action.inputSchema}
            values={parameters}
          />
        ) : null}
      </div>
    </PanelContainer>
  );
}
