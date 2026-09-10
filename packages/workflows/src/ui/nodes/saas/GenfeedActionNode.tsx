'use client';

import { getActionDefinition } from '@genfeedai/actions';
import type { NodeProps } from '@xyflow/react';
import { useTranslations } from 'next-intl';
import { memo, useCallback, useMemo } from 'react';
import { useWorkflowStore } from '../../stores/workflow';
import { BaseNode } from '../BaseNode';
import { ActionSchemaFields } from './ActionSchemaFields';
import {
  createActionVisualDefinition,
  readActionObjectSchema,
  selectOnNodeProperties,
} from './action-schema';

const ACTION_NODE_MIN_WIDTH = 300;
const ACTION_NODE_MIN_HEIGHT = 220;

function readRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function GenfeedActionNodeComponent(props: NodeProps) {
  const translate = useTranslations('pages.workflows.actionNode');
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const data = readRecord(props.data);
  const actionId = typeof data.actionId === 'string' ? data.actionId : '';
  const action = getActionDefinition(actionId);
  const parameters = readRecord(data.parameters);
  const definition = useMemo(
    () => (action ? createActionVisualDefinition(action) : undefined),
    [action],
  );
  const onNodeProperties = useMemo(
    () => selectOnNodeProperties(action?.inputSchema),
    [action],
  );
  const onNodeSchema = useMemo(
    () => ({
      properties: onNodeProperties,
      type: 'object',
    }),
    [onNodeProperties],
  );
  const totalFields = action
    ? Object.keys(readActionObjectSchema(action.inputSchema).properties).length
    : 0;
  const hiddenCount = Math.max(
    0,
    totalFields - Object.keys(onNodeProperties).length,
  );

  const handleChange = useCallback(
    (field: string, value: unknown) => {
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
      updateNodeData(props.id, {
        [field]: value,
        parameters: nextParameters,
      });
    },
    [parameters, props.id, updateNodeData],
  );

  return (
    <BaseNode
      {...props}
      minHeight={ACTION_NODE_MIN_HEIGHT}
      minWidth={ACTION_NODE_MIN_WIDTH}
      nodeDefinition={definition}
      title={action?.label ?? translate('unavailableTitle')}
    >
      {Object.keys(onNodeProperties).length > 0 ? (
        <div
          className="nodrag nopan nowheel px-0.5"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <ActionSchemaFields
            hideDescriptions
            idPrefix="node-"
            onChange={handleChange}
            schema={onNodeSchema}
            values={parameters}
          />
          {hiddenCount > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {translate('moreValues', { count: hiddenCount })}
            </p>
          ) : null}
        </div>
      ) : action ? (
        <p className="px-0.5 text-xs text-muted-foreground">
          {totalFields > 0
            ? translate('inputsToConfigure', { count: totalFields })
            : translate('noConfigurationRequired')}
        </p>
      ) : (
        <p className="px-0.5 text-xs text-destructive">
          {translate('unavailableDescription')}
        </p>
      )}
    </BaseNode>
  );
}

export const GenfeedActionNode = memo(GenfeedActionNodeComponent);
