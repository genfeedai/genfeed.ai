'use client';

import type { WorkflowNode } from '@genfeedai/types';
import { NODE_DEFINITIONS } from '@genfeedai/types';
import { Kbd } from '@genfeedai/ui';
import { useReactFlow } from '@xyflow/react';
import { Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useWorkflowStore } from '../stores/workflowStore';
import { Button } from '../ui/button';

export function NodeSearch() {
  const { activeModal, closeModal } = useUIStore();
  const { nodes, setSelectedNodeIds } = useWorkflowStore();
  const reactFlow = useReactFlow();
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isOpen = activeModal === 'nodeSearch';

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Filter nodes by search query (fuzzy match on label, type, and comment)
  const filteredNodes = useMemo(() => {
    if (!search.trim()) return nodes;

    const query = search.toLowerCase();
    return nodes.filter((node) => {
      const label = (node.data.label || '').toLowerCase();
      const type = (node.type || '').toLowerCase();
      const comment = (
        (node.data as { comment?: string }).comment || ''
      ).toLowerCase();
      const nodeDefLabel =
        NODE_DEFINITIONS[
          node.type as keyof typeof NODE_DEFINITIONS
        ]?.label?.toLowerCase() || '';

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
      const selectedItem = listRef.current.children[selectedIndex] as
        | HTMLElement
        | undefined;
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
    [setSelectedNodeIds, reactFlow, closeModal],
  );

  const handleClose = useCallback(() => {
    closeModal();
    setSearch('');
    setSelectedIndex(0);
  }, [closeModal]);

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
        handleSelectNode(filteredNodes[selectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    },
    [filteredNodes, selectedIndex, handleSelectNode, handleClose],
  );

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) {
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <button
      type="button"
      ref={backdropRef}
      onClick={handleBackdropClick}
      onKeyDown={(e) => e.key === 'Escape' && handleClose()}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] cursor-default border-none bg-transparent p-0 m-0"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
    >
      <div
        className="bg-[var(--background)] border border-[var(--border)] shadow-xl w-full max-w-lg"
        role="dialog"
        aria-label="Find Node"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-[var(--muted-foreground)]" />
            <span className="text-sm font-medium">Find Node</span>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={handleClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div role="listbox" className="p-4" onKeyDown={handleKeyDown}>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search nodes by name, type, or comment..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-[var(--secondary)] border border-[var(--border)] outline-none focus:ring-1 focus:ring-[var(--ring)]"
            />
          </div>

          <div
            role="presentation"
            ref={listRef}
            className="max-h-[300px] overflow-y-auto space-y-1"
          >
            {filteredNodes.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                {search
                  ? `No nodes found for "${search}"`
                  : 'No nodes in workflow'}
              </div>
            ) : (
              filteredNodes.map((node, index) => {
                const nodeDef =
                  NODE_DEFINITIONS[node.type as keyof typeof NODE_DEFINITIONS];
                const comment = (node.data as { comment?: string }).comment;

                return (
                  <Button
                    key={node.id}
                    variant="ghost"
                    onClick={() => handleSelectNode(node)}
                    className={`w-full flex items-center gap-3 p-2 rounded text-left h-auto justify-start ${
                      index === selectedIndex
                        ? 'bg-primary/10 border border-primary/30'
                        : 'hover:bg-secondary/50 border border-transparent'
                    }`}
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded bg-secondary flex items-center justify-center text-xs font-medium">
                      {nodeDef?.label?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-sm">
                        {node.data.label}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {nodeDef?.label || node.type}
                        {comment && ` · ${comment}`}
                      </div>
                    </div>
                  </Button>
                );
              })
            )}
          </div>

          {filteredNodes.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground flex gap-4">
              <span>
                <Kbd variant="muted">up/down</Kbd> Navigate
              </span>
              <span>
                <Kbd variant="muted">Enter</Kbd> Select
              </span>
              <span>
                <Kbd variant="muted">Esc</Kbd> Close
              </span>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
