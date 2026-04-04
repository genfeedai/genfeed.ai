'use client';

import type { WorkflowNode } from '@genfeedai/types';
import { NODE_DEFINITIONS } from '@genfeedai/types';
import { useReactFlow } from '@xyflow/react';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useUIStore } from '@genfeedai/workflow-ui/stores';
import { useWorkflowStore } from '@/store/workflowStore';
import { Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export function NodeSearch() {
  const { activeModal, closeModal } = useUIStore();
  const { nodes, setSelectedNodeIds } = useWorkflowStore();
  const reactFlow = useReactFlow();
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const isOpen = activeModal === 'nodeSearch';

  // Filter nodes by search query (fuzzy match on label, type, and comment)
  const filteredNodes = useMemo(() => {
    if (!search.trim()) return nodes;

    const query = search.toLowerCase();
    return nodes.filter((node) => {
      const label = (node.data.label || '').toLowerCase();
      const type = (node.type || '').toLowerCase();
      const comment = ((node.data as { comment?: string }).comment || '').toLowerCase();
      const nodeDefLabel =
        NODE_DEFINITIONS[node.type as keyof typeof NODE_DEFINITIONS]?.label?.toLowerCase() || '';

      return (
        label.includes(query) ||
        type.includes(query) ||
        comment.includes(query) ||
        nodeDefLabel.includes(query)
      );
    });
  }, [nodes, search]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedItem = listRef.current.children[selectedIndex] as HTMLElement | undefined;
      selectedItem?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleSelectNode = useCallback(
    (node: WorkflowNode) => {
      // Select the node
      setSelectedNodeIds([node.id]);

      // Fit view to the selected node with animation
      reactFlow.fitView({
        duration: 300,
        nodes: [node],
        padding: 0.5,
      });

      // Close the search modal
      closeModal();
      setSearch('');
    },
    [setSelectedNodeIds, reactFlow, closeModal]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredNodes.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && filteredNodes[selectedIndex]) {
        e.preventDefault();
        handleSelectNode(filteredNodes[selectedIndex]);
      }
    },
    [filteredNodes, selectedIndex, handleSelectNode]
  );

  const handleClose = () => {
    closeModal();
    setSearch('');
    setSelectedIndex(0);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Find Node"
      icon={Search}
      maxWidth="max-w-lg"
    >
      <div className="p-4" onKeyDown={handleKeyDown}>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search nodes by name, type, or comment..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        <div ref={listRef} className="max-h-[300px] overflow-y-auto space-y-1">
          {filteredNodes.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              {search ? `No nodes found for "${search}"` : 'No nodes in workflow'}
            </div>
          ) : (
            filteredNodes.map((node, index) => {
              const nodeDef = NODE_DEFINITIONS[node.type as keyof typeof NODE_DEFINITIONS];
              const comment = (node.data as { comment?: string }).comment;

              return (
                <button
                  key={node.id}
                  onClick={() => handleSelectNode(node)}
                  className={`w-full flex items-center gap-3 p-2 rounded text-left transition-colors ${
                    index === selectedIndex
                      ? 'bg-primary/10 border border-primary/30'
                      : 'hover:bg-secondary/50 border border-transparent'
                  }`}
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded bg-secondary flex items-center justify-center text-xs font-medium">
                    {nodeDef?.label?.charAt(0) || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-sm">{node.data.label}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {nodeDef?.label || node.type}
                      {comment && ` · ${comment}`}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {filteredNodes.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground flex gap-4">
            <span>
              <kbd className="px-1.5 py-0.5 bg-secondary rounded">↑↓</kbd> Navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-secondary rounded">Enter</kbd> Select
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-secondary rounded">Esc</kbd> Close
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}
