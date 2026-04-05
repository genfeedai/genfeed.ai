'use client';

import { DollarSign, X } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@genfeedai/workflow-ui/stores';
import { CostBreakdownTab } from './CostBreakdownTab';
import { ExecutionHistoryTab } from './ExecutionHistoryTab';

// =============================================================================
// TYPES
// =============================================================================

type TabId = 'breakdown' | 'history';

interface Tab {
  id: TabId;
  label: string;
}

const TABS: Tab[] = [
  { id: 'breakdown', label: 'Cost Breakdown' },
  { id: 'history', label: 'Execution History' },
];

// =============================================================================
// MAIN MODAL
// =============================================================================

function CostModalComponent() {
  const { activeModal, closeModal } = useUIStore();
  const [activeTab, setActiveTab] = useState<TabId>('breakdown');

  const isOpen = activeModal === 'cost';

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeModal();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeModal]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50" onClick={closeModal} />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[calc(100%-2rem)] max-w-[700px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <DollarSign className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Cost Analysis</h2>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={closeModal}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-4 py-3 text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'breakdown' && <CostBreakdownTab />}
          {activeTab === 'history' && <ExecutionHistoryTab />}
        </div>
      </div>
    </>
  );
}

export const CostModal = memo(CostModalComponent);
