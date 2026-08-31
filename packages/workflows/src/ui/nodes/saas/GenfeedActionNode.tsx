'use client';

import { getActionDefinition } from '@genfeedai/actions';
import type { NodeProps } from '@xyflow/react';
import { useTranslations } from 'next-intl';
import { memo, useMemo } from 'react';
import { BaseNode } from '../BaseNode';
import {
  createActionVisualDefinition,
  formatActionFieldLabel,
  readActionObjectSchema,
} from './action-schema';

function readRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function GenfeedActionNodeComponent(props: NodeProps) {
  const translate = useTranslations('pages.workflows.actionNode');
  const data = readRecord(props.data);
  const actionId = typeof data.actionId === 'string' ? data.actionId : '';
  const action = getActionDefinition(actionId);
  const parameters = readRecord(data.parameters);
  const definition = useMemo(
    () => (action ? createActionVisualDefinition(action) : undefined),
    [action],
  );
  const configuredParameters = Object.entries(parameters).filter(
    ([, value]) => value !== undefined && value !== '',
  );
  const inputCount = action
    ? Object.keys(readActionObjectSchema(action.inputSchema).properties).length
    : 0;
  const formatParameterValue = (value: unknown): string => {
    if (Array.isArray(value)) {
      return translate('items', { count: value.length });
    }
    if (value !== null && typeof value === 'object') {
      return translate('configured');
    }
    if (typeof value === 'boolean') {
      return value ? translate('on') : translate('off');
    }
    if (value === undefined || value === '') {
      return translate('notSet');
    }
    return String(value);
  };

  return (
    <BaseNode
      {...props}
      nodeDefinition={definition}
      title={action?.label ?? translate('unavailableTitle')}
    >
      <div className="space-y-1.5 px-0.5 text-xs">
        {configuredParameters.length > 0 ? (
          configuredParameters.slice(0, 4).map(([field, value]) => (
            <div
              key={field}
              className="flex items-center justify-between gap-3"
            >
              <span className="min-w-0 truncate text-muted-foreground">
                {formatActionFieldLabel(field)}
              </span>
              <span className="max-w-32 truncate text-right text-foreground">
                {formatParameterValue(value)}
              </span>
            </div>
          ))
        ) : action ? (
          <p className="text-muted-foreground">
            {inputCount > 0
              ? translate('inputsToConfigure', { count: inputCount })
              : translate('noConfigurationRequired')}
          </p>
        ) : (
          <p className="text-destructive">
            {translate('unavailableDescription')}
          </p>
        )}
        {configuredParameters.length > 4 ? (
          <p className="text-muted-foreground">
            {translate('moreValues', {
              count: configuredParameters.length - 4,
            })}
          </p>
        ) : null}
      </div>
    </BaseNode>
  );
}

export const GenfeedActionNode = memo(GenfeedActionNodeComponent);
