'use client';

import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useUIStore } from '@genfeedai/workflow-ui/stores';
import { Keyboard, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

interface ShortcutItem {
  keys: string;
  description: string;
  category: string;
}

const SHORTCUTS: ShortcutItem[] = [
  // Navigation
  { category: 'Navigation', description: 'Pan canvas', keys: 'Scroll' },
  { category: 'Navigation', description: 'Zoom in/out', keys: 'Ctrl + Scroll' },
  { category: 'Navigation', description: 'Fit view to selection (or all)', keys: 'F' },
  { category: 'Navigation', description: 'Toggle sidebar', keys: 'M' },

  // Selection
  { category: 'Selection', description: 'Select node', keys: 'Click' },
  { category: 'Selection', description: 'Add to selection', keys: 'Shift + Click' },
  { category: 'Selection', description: 'Marquee select', keys: 'Drag' },
  { category: 'Selection', description: 'Select all nodes', keys: 'Ctrl + A' },
  { category: 'Selection', description: 'Search nodes', keys: 'Ctrl + F' },

  // Editing
  { category: 'Editing', description: 'Undo', keys: 'Ctrl + Z' },
  { category: 'Editing', description: 'Redo', keys: 'Ctrl + Shift + Z' },
  { category: 'Editing', description: 'Copy', keys: 'Ctrl + C' },
  { category: 'Editing', description: 'Cut', keys: 'Ctrl + X' },
  { category: 'Editing', description: 'Paste', keys: 'Ctrl + V' },
  { category: 'Editing', description: 'Duplicate', keys: 'Ctrl + D' },
  { category: 'Editing', description: 'Delete selected', keys: 'Delete / Backspace' },

  // Nodes
  { category: 'Nodes', description: 'Add Image Gen node', keys: 'Shift + I' },
  { category: 'Nodes', description: 'Add Video Gen node', keys: 'Shift + V' },
  { category: 'Nodes', description: 'Add Prompt node', keys: 'Shift + P' },
  { category: 'Nodes', description: 'Add LLM node', keys: 'Shift + L' },

  // Organization
  { category: 'Organization', description: 'Toggle lock on selected', keys: 'L' },
  { category: 'Organization', description: 'Group selected nodes', keys: 'Ctrl + G' },
  { category: 'Organization', description: 'Ungroup', keys: 'Ctrl + Shift + G' },
  { category: 'Organization', description: 'Unlock all nodes', keys: 'Ctrl + Shift + L' },

  // Help
  { category: 'Help', description: 'Show this help', keys: '?' },
];

const CATEGORIES = ['Navigation', 'Selection', 'Editing', 'Nodes', 'Organization', 'Help'];

export function ShortcutHelpModal() {
  const { activeModal, closeModal } = useUIStore();
  const [searchQuery, setSearchQuery] = useState('');

  const isOpen = activeModal === 'shortcutHelp';

  const filteredShortcuts = useMemo(() => {
    if (!searchQuery.trim()) return SHORTCUTS;

    const query = searchQuery.toLowerCase();
    return SHORTCUTS.filter(
      (shortcut) =>
        shortcut.keys.toLowerCase().includes(query) ||
        shortcut.description.toLowerCase().includes(query) ||
        shortcut.category.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const groupedShortcuts = useMemo(() => {
    const grouped: Record<string, ShortcutItem[]> = {};
    for (const category of CATEGORIES) {
      const items = filteredShortcuts.filter((s) => s.category === category);
      if (items.length > 0) {
        grouped[category] = items;
      }
    }
    return grouped;
  }, [filteredShortcuts]);

  const handleClose = () => {
    closeModal();
    setSearchQuery('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Keyboard Shortcuts"
      icon={Keyboard}
      maxWidth="max-w-2xl"
    >
      <div className="p-4">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search shortcuts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto space-y-6 pr-2">
          {Object.entries(groupedShortcuts).map(([category, shortcuts]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">{category}</h3>
              <div className="space-y-1">
                {shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.keys}
                    className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-secondary/50"
                  >
                    <span className="text-sm">{shortcut.description}</span>
                    <kbd className="px-2 py-1 text-xs font-mono bg-secondary rounded border border-border">
                      {shortcut.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {filteredShortcuts.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              No shortcuts found for "{searchQuery}"
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
