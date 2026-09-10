'use client';

import { ALL_ACTIONS } from '@genfeedai/actions';
import {
  NodePalette,
  type PaletteNodeDefinition,
} from '@genfeedai/workflows/ui';
import { useMemo } from 'react';

const CLOUD_ENGINE_NATIVE_NODE_TYPES = ['workflowInput'] as const;

const CLOUD_NATIVE_PALETTE_NODES: PaletteNodeDefinition[] = [
  {
    category: 'input',
    description: 'Pick an image from the library',
    icon: 'Image',
    label: 'Image',
    type: 'input-image',
  },
  {
    category: 'input',
    description: 'Pick a video from the library',
    icon: 'Video',
    label: 'Video',
    type: 'input-video',
  },
];

/**
 * Cloud workflow palette: engine primitives plus catalog-generated action
 * entries. Product actions all create the same `genfeedAction` node shape.
 */
export function CloudNodePalette() {
  const additionalNodes = useMemo((): PaletteNodeDefinition[] => {
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

    return [...CLOUD_NATIVE_PALETTE_NODES, ...actionNodes];
  }, []);

  return (
    <NodePalette
      additionalNodes={additionalNodes}
      baseNodeTypes={CLOUD_ENGINE_NATIVE_NODE_TYPES}
    />
  );
}
