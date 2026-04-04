'use client';

import type { HandleType, NodeCategory, NodeType } from '@genfeedai/types';
import {
  CONNECTION_RULES,
  getNodesByCategory,
  NODE_DEFINITIONS,
} from '@genfeedai/types';
import { useReactFlow } from '@xyflow/react';
import { Plus, Search, X } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useWorkflowStore } from '../stores/workflowStore';

const CATEGORY_LABELS: Record<NodeCategory, string> = {
  ai: 'AI',
  composition: 'Composition',
  input: 'Input',
  output: 'Output',
  processing: 'Processing',
};

const CATEGORY_ORDER: NodeCategory[] = [
  'input',
  'ai',
  'processing',
  'output',
  'composition',
];

function ConnectionDropMenuComponent() {
  const { connectionDropMenu, closeConnectionDropMenu } = useUIStore();
  const { addNode, findCompatibleHandle, onConnect } = useWorkflowStore();
  const reactFlow = useReactFlow();
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const isOpen = connectionDropMenu !== null;

  // Get compatible node types based on the source handle type
  const compatibleNodes = useMemo(() => {
    if (!connectionDropMenu) return [];

    const sourceType = connectionDropMenu.sourceHandleType;
    const compatibleTargetTypes = CONNECTION_RULES[sourceType] ?? [];

    const nodesByCategory = getNodesByCategory();
    const result: Array<{
      type: NodeType;
      label: string;
      category: NodeCategory;
    }> = [];

    for (const category of CATEGORY_ORDER) {
      const defs = nodesByCategory[category] ?? [];
      for (const def of defs) {
        // Check if any of this node's inputs accept a compatible type
        const hasCompatibleInput = def.inputs.some((input) =>
          compatibleTargetTypes.includes(input.type),
        );
        if (hasCompatibleInput) {
          result.push({
            category,
            label: def.label,
            type: def.type,
          });
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
    const grouped: Partial<Record<NodeCategory, typeof filteredNodes>> = {};
    for (const node of filteredNodes) {
      if (!grouped[node.category]) grouped[node.category] = [];
      grouped[node.category]!.push(node);
    }
    return grouped;
  }, [filteredNodes]);

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const items = listRef.current.querySelectorAll('[data-node-item]');
      const selected = items[selectedIndex] as HTMLElement | undefined;
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleSelect = useCallback(
    (nodeType: NodeType) => {
      if (!connectionDropMenu) return;

      // Convert screen position to flow position for node placement
      const position = reactFlow.screenToFlowPosition({
        x: connectionDropMenu.screenPosition.x,
        y: connectionDropMenu.screenPosition.y,
      });

      // Create the node
      const newNodeId = addNode(nodeType, position);

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
      connectionDropMenu,
      reactFlow,
      addNode,
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

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) {
      closeConnectionDropMenu();
    }
  };

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
    <div
      ref={backdropRef}
      className="fixed inset-0 z-40"
      onClick={handleBackdropClick}
    >
      <div
        style={menuStyle}
        className="bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-xl w-64 max-h-80 flex flex-col"
        role="dialog"
        aria-label="Add Node"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
          <Plus className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
          <span className="text-xs font-medium">Add Connected Node</span>
        </div>

        {/* Search */}
        <div className="px-3 py-2" onKeyDown={handleKeyDown}>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--muted-foreground)]" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search compatible nodes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-[var(--secondary)] border border-[var(--border)] rounded-md outline-none focus:ring-1 focus:ring-[var(--ring)]"
            />
          </div>
        </div>

        {/* Node list */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto px-1.5 pb-1.5"
          onKeyDown={handleKeyDown}
        >
          {filteredNodes.length === 0 ? (
            <div className="text-center text-[var(--muted-foreground)] text-xs py-4">
              No compatible nodes found
            </div>
          ) : (
            Object.entries(groupedNodes).map(([category, nodes]) => {
              if (!nodes || nodes.length === 0) return null;
              return (
                <div key={category} className="mb-1">
                  <div className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider px-2 py-1">
                    {CATEGORY_LABELS[category as NodeCategory]}
                  </div>
                  {nodes.map((node) => {
                    const currentIndex = flatIndex++;
                    return (
                      <button
                        key={node.type}
                        data-node-item
                        onClick={() => handleSelect(node.type)}
                        className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                          currentIndex === selectedIndex
                            ? 'bg-[var(--primary)]/10 text-[var(--foreground)]'
                            : 'text-[var(--foreground)] hover:bg-[var(--secondary)]'
                        }`}
                      >
                        {node.label}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export const ConnectionDropMenu = memo(ConnectionDropMenuComponent);
