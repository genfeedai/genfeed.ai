'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { NodeCatalog } from '@genfeedai/workflows/ui';
import {
  type CatalogNodeEntry,
  useAddCatalogNode,
} from '@genfeedai/workflows/ui/hooks';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import {
  CLOUD_ENGINE_NATIVE_NODE_TYPES,
  useCloudNodeCatalog,
} from '@/features/workflows/hooks/useCloudNodeCatalog';

/**
 * Toolbar menu that adds a workflow step at the centre of the canvas. It
 * replaces the fixed palette column so the canvas keeps the full width.
 */
export function AddNodeMenu() {
  const translate = useTranslations('pages.workflows.addNode');
  const additionalNodes = useCloudNodeCatalog();
  const addCatalogNode = useAddCatalogNode();
  const [isOpen, setIsOpen] = useState(false);

  const handleAdd = useCallback(
    (entry: CatalogNodeEntry) => {
      addCatalogNode(entry);
      setIsOpen(false);
    },
    [addCatalogNode],
  );

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          icon={<Plus className="size-4" />}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          {translate('label')}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex h-[28rem] w-80 flex-col overflow-hidden p-0"
      >
        <NodeCatalog
          additionalNodes={additionalNodes}
          baseNodeTypes={CLOUD_ENGINE_NATIVE_NODE_TYPES}
          onAdd={handleAdd}
        />
      </PopoverContent>
    </Popover>
  );
}
