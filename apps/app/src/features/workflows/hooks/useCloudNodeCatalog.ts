import { ALL_ACTIONS } from '@genfeedai/actions';
import type { PaletteNodeDefinition } from '@genfeedai/workflows/ui';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

export const CLOUD_ENGINE_NATIVE_NODE_TYPES = ['workflowInput'] as const;

/**
 * Cloud workflow node catalog: engine primitives plus catalog-generated action
 * entries. Product actions all create the same `genfeedAction` node shape.
 */
export function useCloudNodeCatalog(): PaletteNodeDefinition[] {
  const translate = useTranslations('pages.workflows.nodePalette');

  return useMemo((): PaletteNodeDefinition[] => {
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
}
