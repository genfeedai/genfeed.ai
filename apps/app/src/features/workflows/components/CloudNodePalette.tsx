'use client';

import { SAAS_NODE_DEFINITIONS } from '@genfeedai/workflows/nodes';
import {
  NodePalette,
  type PaletteNodeDefinition,
} from '@genfeedai/workflows/ui';
import { useMemo } from 'react';
import { extendedNodeDefinitions } from '@/features/workflows/nodes/definitions';

/**
 * Cloud workflow palette: core nodes + SaaS/extended entries including
 * socialRead and reportDelivery (#2664).
 */
export function CloudNodePalette() {
  const additionalNodes = useMemo((): PaletteNodeDefinition[] => {
    const saas = Object.values(SAAS_NODE_DEFINITIONS).map((def) => ({
      category: def.category,
      description: def.description,
      icon: def.icon,
      label: def.label,
      type: def.type,
    }));

    const extended = Object.values(extendedNodeDefinitions).map((def) => ({
      category: def.category,
      description: def.description,
      icon: def.icon,
      label: def.label,
      type: def.type,
    }));

    return [...saas, ...extended];
  }, []);

  return <NodePalette additionalNodes={additionalNodes} />;
}
