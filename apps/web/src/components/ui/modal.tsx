'use client';

import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { memo, useEffect, type ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: LucideIcon;
  children: ReactNode;
  /** Tailwind max-width class, defaults to 'max-w-[600px]' */
  maxWidth?: string;
  /** Whether to show the default header. Defaults to true. */
  showHeader?: boolean;
  /** Additional className for the modal container */
  className?: string;
}

function ModalComponent({
  isOpen,
  onClose,
  title,
  icon: Icon,
  children,
  maxWidth = 'max-w-[600px]',
  showHeader = true,
  className,
}: ModalProps) {
  // ESC key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div
        className={`fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100%-2rem)] ${maxWidth} -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg bg-card shadow-xl ${className ?? ''}`}
      >
        {showHeader && (
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="flex items-center gap-3">
              {Icon && <Icon className="h-5 w-5 text-primary" />}
              <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        )}
        {children}
      </div>
    </>
  );
}

export const Modal = memo(ModalComponent);

// =============================================================================
// MODAL TABS
// =============================================================================

interface ModalTabsProps<T extends string> {
  tabs: Array<{ id: T; label: string }>;
  activeTab: T;
  onTabChange: (tab: T) => void;
}

function ModalTabsComponent<T extends string>({ tabs, activeTab, onTabChange }: ModalTabsProps<T>) {
  return (
    <div className="flex border-b border-border px-6">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`relative px-4 py-3 text-sm font-medium transition ${
            activeTab === tab.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {tab.label}
          {activeTab === tab.id && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
      ))}
    </div>
  );
}

// Can't memo a generic component easily, export as-is
export { ModalTabsComponent as ModalTabs };
