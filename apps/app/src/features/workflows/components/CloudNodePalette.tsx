'use client';

import { ALL_ACTIONS } from '@genfeedai/actions';
import {
  NodePalette,
  type PaletteNodeDefinition,
} from '@genfeedai/workflows/ui';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

const CLOUD_ENGINE_NATIVE_NODE_TYPES = ['workflowInput'] as const;

/**
 * Cloud workflow palette: engine primitives plus catalog-generated action
 * entries. Product actions all create the same `genfeedAction` node shape.
 */
export function CloudNodePalette() {
  const translate = useTranslations('pages.workflows.nodePalette');
  const additionalNodes = useMemo((): PaletteNodeDefinition[] => {
    const nativeNodes: PaletteNodeDefinition[] = [
      {
        category: 'input',
        description: translate('image.description'),
        icon: 'Image',
        label: translate('image.label'),
        type: 'input-image',
      },
      {
        category: 'input',
        description: translate('video.description'),
        icon: 'Video',
        label: translate('video.label'),
        type: 'input-video',
      },
    ];
    const actionNodes = ALL_ACTIONS.filter(
      (action) => action.visibility === 'workflow',
    ).map((action) => {
      if (!action.workflowCategory || !action.workflowIcon) {
        throw new Error(
          `Workflow action ${action.id} is missing presentation metadata`,
        );
      }

      return {
        actionId: action.id,
        category: action.workflowCategory,
        description: action.description,
        icon: action.workflowIcon,
        label: action.label,
        type: 'genfeedAction',
      };
    });

    return [...nativeNodes, ...actionNodes];
  }, [translate]);

  return (
    <NodePalette
      additionalNodes={additionalNodes}
      baseNodeTypes={CLOUD_ENGINE_NATIVE_NODE_TYPES}
    />
  );
}
