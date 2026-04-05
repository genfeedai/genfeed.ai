'use client';

import { CATEGORY_LABELS, type IPrompt, type PromptCategory } from '@genfeedai/types';
import { BookMarked, Copy, MoreVertical, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import Image from 'next/image';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePromptLibraryStore } from '@/store/promptLibraryStore';
import { useUIStore } from '@genfeedai/workflow-ui/stores';
import { CreatePromptModal } from './CreatePromptModal';

interface PromptCardProps {
  item: IPrompt;
  onSelect: (item: IPrompt) => void;
  onEdit: (item: IPrompt) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

function PromptCard({ item, onSelect, onEdit, onDuplicate, onDelete }: PromptCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = `prompt-menu-${item._id}`;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div
      className="group relative cursor-pointer rounded-lg border border-border bg-background p-4 transition hover:border-primary"
      onClick={() => onSelect(item)}
    >
      {/* Thumbnail or placeholder */}
      {item.thumbnail ? (
        <Image
          src={item.thumbnail}
          alt={item.name}
          width={200}
          height={96}
          className="mb-3 h-24 w-full rounded-md object-cover"
          unoptimized
        />
      ) : (
        <div className="mb-3 flex h-24 w-full items-center justify-center rounded-md bg-secondary">
          <Sparkles className="h-8 w-8 text-muted-foreground" />
        </div>
      )}

      {/* Content */}
      <h3 className="truncate text-sm font-medium text-foreground">{item.name}</h3>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.promptText}</p>

      {/* Category badge */}
      <div className="mt-2 flex items-center gap-2">
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
          {CATEGORY_LABELS[item.category]}
        </span>
        {item.isFeatured && (
          <span className="rounded bg-chart-3/10 px-1.5 py-0.5 text-[10px] text-chart-3">
            Featured
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
        <span>{item.useCount} uses</span>
      </div>

      {/* Actions menu */}
      <div className="absolute right-2 top-2" ref={menuRef}>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="opacity-0 group-hover:opacity-100"
          aria-haspopup="menu"
          aria-expanded={showMenu}
          aria-controls={menuId}
          aria-label={`Actions for ${item.name}`}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>

        {showMenu && (
          <div
            id={menuId}
            role="menu"
            aria-label="Prompt actions"
            className="absolute right-0 top-full z-10 mt-1 w-32 rounded-md border border-border bg-card py-1 shadow-lg"
          >
            <button
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(item);
                setShowMenu(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-secondary"
            >
              <BookMarked className="h-3 w-3" /> Edit
            </button>
            <button
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(item._id);
                setShowMenu(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-secondary"
            >
              <Copy className="h-3 w-3" /> Duplicate
            </button>
            <button
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item._id);
                setShowMenu(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-destructive hover:bg-secondary"
            >
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PromptLibraryModalComponent() {
  const { activeModal, closeModal } = useUIStore();
  const {
    items,
    isLoading,
    searchQuery,
    categoryFilter,
    isCreateModalOpen,
    setSearchQuery,
    setCategoryFilter,
    loadItems,
    openCreateModal,
    duplicateItem,
    deleteItem,
  } = usePromptLibraryStore();

  const isOpen = activeModal === 'promptLibrary';

  // Load items when modal opens
  useEffect(() => {
    if (isOpen) {
      const controller = new AbortController();
      loadItems(undefined, controller.signal);
      return () => controller.abort();
    }
  }, [isOpen, loadItems]);

  const handleSelect = useCallback(
    (_item: IPrompt) => {
      // Just close modal for now - integration will handle applying to node
      closeModal();
    },
    [closeModal]
  );

  const handleEdit = useCallback(
    (item: IPrompt) => {
      openCreateModal(item);
    },
    [openCreateModal]
  );

  const handleDuplicate = useCallback(
    async (id: string) => {
      await duplicateItem(id);
    },
    [duplicateItem]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (confirm('Are you sure you want to delete this prompt?')) {
        await deleteItem(id);
      }
    },
    [deleteItem]
  );

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={closeModal} />
      <div className="fixed inset-4 z-50 flex flex-col overflow-hidden rounded-lg bg-card shadow-xl md:inset-10">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <BookMarked className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Prompt Library</h2>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={closeModal}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 border-b border-border px-6 py-4">
          {/* Search */}
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search prompts..."
              className="pl-10"
            />
          </div>

          {/* Category filter */}
          <select
            value={categoryFilter ?? ''}
            onChange={(e) =>
              setCategoryFilter(e.target.value ? (e.target.value as PromptCategory) : null)
            }
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">All Categories</option>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>

          {/* Create button */}
          <Button onClick={() => openCreateModal()}>
            <Plus className="h-4 w-4" />
            New Prompt
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
              <BookMarked className="mb-4 h-12 w-12" />
              <p className="text-lg font-medium">No prompts yet</p>
              <p className="text-sm">Create your first prompt to get started</p>
              <Button className="mt-4" onClick={() => openCreateModal()}>
                <Plus className="h-4 w-4" />
                Create Prompt
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {items.map((item) => (
                <PromptCard
                  key={item._id}
                  item={item}
                  onSelect={handleSelect}
                  onEdit={handleEdit}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {isCreateModalOpen && <CreatePromptModal />}
    </>
  );
}

export const PromptLibraryModal = memo(PromptLibraryModalComponent);
