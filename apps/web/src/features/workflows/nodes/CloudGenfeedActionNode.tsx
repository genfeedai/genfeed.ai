'use client';

import { getActionDefinition } from '@genfeedai/actions';
import { readRecord } from '@genfeedai/utils/data/extract.util';
import {
  ActionSchemaFields,
  createActionVisualDefinition,
  readActionObjectSchema,
  selectOnNodeProperties,
} from '@genfeedai/workflows/ui';
import { BaseNode } from '@genfeedai/workflows/ui/nodes';
import { useWorkflowStore } from '@genfeedai/workflows/ui/stores';
import FormControl from '@ui/primitives/field';
import { OptionSelect } from '@ui/primitives/option-select';
import type { NodeProps } from '@xyflow/react';
import { useTranslations } from 'next-intl';
import { memo, useCallback, useMemo } from 'react';
import { useWorkflowActionScope } from '@/features/workflows/hooks/useWorkflowActionDefaults';

const ACTION_NODE_MIN_WIDTH = 300;
const ACTION_NODE_MIN_HEIGHT = 220;

function CloudGenfeedActionNodeComponent(props: NodeProps) {
  const translate = useTranslations('pages.workflows.actionNode');
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const scope = useWorkflowActionScope();
  const data = readRecord(props.data);
  const actionId = typeof data.actionId === 'string' ? data.actionId : '';
  const action = getActionDefinition(actionId);
  const parameters = readRecord(data.parameters);
  const properties = readActionObjectSchema(action?.inputSchema).properties;
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
  const totalFields = action ? Object.keys(properties).length : 0;
  const hiddenCount = Math.max(
    0,
    totalFields -
      Object.keys(onNodeProperties).length -
      (properties.brandId ? 1 : 0),
  );
  const brandValue =
    (typeof parameters.brandId === 'string' && parameters.brandId) ||
    scope.brandId;

  const brandOptions = (
    scope.brands.length > 0
      ? scope.brands
      : brandValue
        ? [{ id: brandValue, label: scope.brandLabel }]
        : []
  ).map((brand) => ({ label: brand.label, value: brand.id }));

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

  const hasOnNodeFields =
    Boolean(properties.brandId) || Object.keys(onNodeProperties).length > 0;

  return (
    <BaseNode
      {...props}
      minHeight={ACTION_NODE_MIN_HEIGHT}
      minWidth={ACTION_NODE_MIN_WIDTH}
      nodeDefinition={definition}
      title={action?.label ?? translate('unavailableTitle')}
    >
      {hasOnNodeFields ? (
        <div
          className="nodrag nopan nowheel space-y-2.5 px-0.5"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {properties.brandId ? (
            <FormControl label={translate('brand')}>
              <OptionSelect
                ariaLabel={translate('brand')}
                className="nodrag"
                onValueChange={(value) => handleChange('brandId', value)}
                options={brandOptions}
                placeholder={translate('selectBrand')}
                value={brandValue}
              />
            </FormControl>
          ) : null}
          {Object.keys(onNodeProperties).length > 0 ? (
            <ActionSchemaFields
              hideDescriptions
              idPrefix={`node-${props.id}-`}
              onChange={handleChange}
              schema={onNodeSchema}
              values={parameters}
            />
          ) : null}
          {hiddenCount > 0 ? (
            <p className="text-xs text-muted-foreground">
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

export const CloudGenfeedActionNode = memo(CloudGenfeedActionNodeComponent);
