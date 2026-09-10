'use client';

import { getActionDefinition } from '@genfeedai/actions';
import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import { Button } from '@genfeedai/ui/primitives/button';
import FormSearchbar from '@genfeedai/ui/primitives/searchbar';
import { useReactFlow } from '@xyflow/react';
import { Plus } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NODE_DEFINITIONS } from '../../nodes/registry/merged-registry';
import type { ExtendedNodeCategory } from '../../nodes/types';
import {
  isCompatibleWorkflowHandle,
  resolveWorkflowNodeDefinition,
} from '../lib/workflowNodeHandles';
import { useWorkflowUIConfig } from '../provider/WorkflowUIProvider';
import { useUIStore } from '../stores/uiStore';
import { useWorkflowStore } from '../stores/workflow';

const CATEGORY_LABELS: Record<ExtendedNodeCategory, string> = {
  ai: 'AI',
  automation: 'Automation',
  distribution: 'Distribution',
  repurposing: 'Repurposing',
  saas: 'Workspace',
  composition: 'Composition',
  input: 'Input',
  output: 'Output',
  processing: 'Processing',
};

const CATEGORY_ORDER: ExtendedNodeCategory[] = [
  'input',
  'ai',
  'processing',
  'output',
  'composition',
  'automation',
  'distribution',
  'repurposing',
  'saas',
];

function ConnectionDropMenuComponent() {
  const { connectionDropMenu, closeConnectionDropMenu } = useUIStore();
  const { addNode, updateNodeData, findCompatibleHandle, onConnect } =
    useWorkflowStore();
  const reactFlow = useReactFlow();
  const { actionParameterDefaults } = useWorkflowUIConfig();
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isOpen = connectionDropMenu !== null;

  // Get compatible node types based on the source handle type
  const compatibleNodes = useMemo(() => {
    if (!connectionDropMenu) return [];

    const sourceType = connectionDropMenu.sourceHandleType;
    const result: Array<{
      type: string;
      label: string;
      category: ExtendedNodeCategory;
    }> = [];

    for (const category of CATEGORY_ORDER) {
      for (const [type, registered] of Object.entries(NODE_DEFINITIONS)) {
        if (registered.category !== category || type === 'genfeedAction')
          continue;
        const action = getActionDefinition(type);
        const definition = action
          ? resolveWorkflowNodeDefinition('genfeedAction', {
              actionId: action.id,
            })
          : resolveWorkflowNodeDefinition(type);
        if (
          definition?.inputs.some((input) =>
            isCompatibleWorkflowHandle(sourceType, input.type),
          )
        ) {
          result.push({ category, label: registered.label, type });
        }
      }
    }

    return result;
  }, [connectionDropMenu]);

  // Filter by search
  const filteredNodes = useMemo(() => {
    if (!search.trim()) return compatibleNodes;
    const query = search.toLowerCase();
    return compatibleNodes.filter(
      (n) =>
        n.label.toLowerCase().includes(query) ||
        n.type.toLowerCase().includes(query),
    );
  }, [compatibleNodes, search]);

  // Group filtered nodes by category
  const groupedNodes = useMemo(() => {
    const grouped: Partial<Record<ExtendedNodeCategory, typeof filteredNodes>> =
      {};
    for (const node of filteredNodes) {
      if (!grouped[node.category]) grouped[node.category] = [];
      grouped[node.category]?.push(node);
    }
    return grouped;
  }, [filteredNodes]);

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedIndex(0);
      const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const items = listRef.current.querySelectorAll('[data-node-item]');
      const selected = items[selectedIndex] as HTMLElement | undefined;
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleSelect = useCallback(
    (nodeType: string) => {
      if (!connectionDropMenu) return;

      // Convert screen position to flow position for node placement
      const position = reactFlow.screenToFlowPosition({
        x: connectionDropMenu.screenPosition.x,
        y: connectionDropMenu.screenPosition.y,
      });

      // Create the node
      const action = getActionDefinition(nodeType);
      const newNodeId = addNode(action ? 'genfeedAction' : nodeType, position);
      if (!newNodeId) return;
      if (action) {
        updateNodeData(newNodeId, {
          actionId: action.id,
          label: action.label,
          parameters: actionParameterDefaults?.(action.id) ?? {},
        });
      }

      // Auto-connect: find compatible handle on the new node
      const compatibleHandle = findCompatibleHandle(
        connectionDropMenu.sourceNodeId,
        connectionDropMenu.sourceHandleId,
        newNodeId,
      );

      if (compatibleHandle) {
        onConnect({
          source: connectionDropMenu.sourceNodeId,
          sourceHandle: connectionDropMenu.sourceHandleId,
          target: newNodeId,
          targetHandle: compatibleHandle,
        });
      }

      closeConnectionDropMenu();
    },
    [
      actionParameterDefaults,
      connectionDropMenu,
      reactFlow,
      addNode,
      updateNodeData,
      findCompatibleHandle,
      onConnect,
      closeConnectionDropMenu,
    ],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          Math.min(prev + 1, filteredNodes.length - 1),
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && filteredNodes[selectedIndex]) {
        e.preventDefault();
        handleSelect(filteredNodes[selectedIndex].type);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeConnectionDropMenu();
      }
    },
    [filteredNodes, selectedIndex, handleSelect, closeConnectionDropMenu],
  );

  if (!isOpen || !connectionDropMenu) return null;

  // Position the menu at the cursor location
  const menuStyle: React.CSSProperties = {
    left: connectionDropMenu.screenPosition.x,
    position: 'fixed',
    top: connectionDropMenu.screenPosition.y,
    zIndex: 50,
  };

  let flatIndex = 0;

  return (
    <>
      <Button
        withWrapper={false}
        type="button"
        variant={ButtonVariant.GHOST}
        size={ButtonSize.ICON}
        className="fixed inset-0 z-40 size-full p-0 opacity-0"
        onClick={closeConnectionDropMenu}
        aria-label="Close add node menu"
      />
      <div
        style={menuStyle}
        className="bg-background border border-border shadow-xl w-64 max-h-80 flex flex-col"
        role="dialog"
        aria-label="Add Node"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Plus className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Add Connected Node</span>
        </div>

        {/* Search */}
        <div className="px-3 py-2">
          <FormSearchbar
            ariaLabel="Search compatible nodes"
            inputClassName="text-xs bg-secondary border-border outline-none focus:ring-2 focus:ring-ring"
            inputRef={inputRef}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search compatible nodes..."
            size={ComponentSize.SM}
            value={search}
          />
        </div>

        {/* Node list */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-1.5 pb-1.5">
          {filteredNodes.length === 0 ? (
            <div className="text-center text-muted-foreground text-xs py-4">
              No compatible nodes found
            </div>
          ) : (
            Object.entries(groupedNodes).map(([category, nodes]) => {
              if (!nodes || nodes.length === 0) return null;
              return (
                <div key={category} className="mb-1">
                  <div className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
                    {CATEGORY_LABELS[category as ExtendedNodeCategory]}
                  </div>
                  {nodes.map((node) => {
                    const currentIndex = flatIndex++;
                    return (
                      <Button
                        withWrapper={false}
                        key={node.type}
                        variant={ButtonVariant.GHOST}
                        data-node-item
                        onClick={() => handleSelect(node.type)}
                        className={`w-full text-left px-2 py-1.5 rounded text-xs h-auto justify-start ${
                          currentIndex === selectedIndex
                            ? 'bg-primary/10 text-foreground'
                            : 'text-foreground hover:bg-secondary'
                        }`}
                      >
                        {node.label}
                      </Button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

export const ConnectionDropMenu = memo(ConnectionDropMenuComponent);
