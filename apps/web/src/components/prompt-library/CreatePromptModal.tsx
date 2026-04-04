'use client';

import {
  CAMERA_PRESETS,
  CATEGORY_LABELS,
  type ICreatePrompt,
  LIGHTING_PRESETS,
  MOOD_PRESETS,
  type PromptCategory,
  SCENE_PRESETS,
  STYLE_PRESETS,
} from '@genfeedai/types';
import { X } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { logger } from '@/lib/logger';
import { usePromptLibraryStore } from '@/store/promptLibraryStore';

function CreatePromptModalComponent() {
  const { editingItem, closeCreateModal, createItem, updateItem, isLoading } =
    usePromptLibraryStore();

  const isEditing = !!editingItem;

  const [formData, setFormData] = useState<ICreatePrompt>({
    aspectRatio: editingItem?.aspectRatio ?? '',
    category: editingItem?.category ?? 'custom',
    description: editingItem?.description ?? '',
    name: editingItem?.name ?? '',
    preferredModel: editingItem?.preferredModel ?? '',
    promptText: editingItem?.promptText ?? '',
    styleSettings: editingItem?.styleSettings ?? {},
    tags: editingItem?.tags ?? [],
  });

  const [tagInput, setTagInput] = useState('');

  const handleChange = useCallback(
    (field: keyof ICreatePrompt, value: string | string[] | Record<string, string>) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const handleStyleChange = useCallback((field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      styleSettings: { ...prev.styleSettings, [field]: value },
    }));
  }, []);

  const handleAddTag = useCallback(() => {
    if (tagInput.trim() && !formData.tags?.includes(tagInput.trim())) {
      setFormData((prev) => ({
        ...prev,
        tags: [...(prev.tags ?? []), tagInput.trim()],
      }));
      setTagInput('');
    }
  }, [tagInput, formData.tags]);

  const handleRemoveTag = useCallback((tag: string) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags?.filter((t) => t !== tag) ?? [],
    }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!formData.name || !formData.promptText) return;

    try {
      if (isEditing && editingItem) {
        await updateItem(editingItem._id, formData);
      } else {
        await createItem(formData);
      }
    } catch (error) {
      logger.error('Failed to save prompt', error, { context: 'CreatePromptModal' });
    }
  }, [formData, isEditing, editingItem, createItem, updateItem]);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[60]" onClick={closeCreateModal} />
      <div className="fixed inset-10 md:inset-20 lg:inset-x-40 bg-[var(--card)] rounded-lg shadow-xl z-[60] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            {isEditing ? 'Edit Prompt' : 'Create New Prompt'}
          </h2>
          <button
            onClick={closeCreateModal}
            className="p-2 hover:bg-[var(--secondary)] rounded transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="e.g., Cinematic Product Ad"
                className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <select
                value={formData.category}
                onChange={(e) => handleChange('category', e.target.value as PromptCategory)}
                className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              >
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Prompt Text */}
          <div>
            <label className="block text-sm font-medium mb-1">Prompt *</label>
            <textarea
              value={formData.promptText}
              onChange={(e) => handleChange('promptText', e.target.value)}
              placeholder="Enter your prompt text..."
              rows={4}
              className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Describe what this prompt is for..."
              rows={2}
              className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
            />
          </div>

          {/* Style Settings */}
          <div>
            <h3 className="text-sm font-medium mb-3">Style Settings</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {/* Mood */}
              <div>
                <label className="block text-xs text-[var(--muted-foreground)] mb-1">Mood</label>
                <select
                  value={formData.styleSettings?.mood ?? ''}
                  onChange={(e) => handleStyleChange('mood', e.target.value)}
                  className="w-full px-2 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                >
                  <option value="">None</option>
                  {MOOD_PRESETS.map((preset) => (
                    <option key={preset} value={preset}>
                      {preset}
                    </option>
                  ))}
                </select>
              </div>

              {/* Style */}
              <div>
                <label className="block text-xs text-[var(--muted-foreground)] mb-1">Style</label>
                <select
                  value={formData.styleSettings?.style ?? ''}
                  onChange={(e) => handleStyleChange('style', e.target.value)}
                  className="w-full px-2 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                >
                  <option value="">None</option>
                  {STYLE_PRESETS.map((preset) => (
                    <option key={preset} value={preset}>
                      {preset}
                    </option>
                  ))}
                </select>
              </div>

              {/* Camera */}
              <div>
                <label className="block text-xs text-[var(--muted-foreground)] mb-1">Camera</label>
                <select
                  value={formData.styleSettings?.camera ?? ''}
                  onChange={(e) => handleStyleChange('camera', e.target.value)}
                  className="w-full px-2 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                >
                  <option value="">None</option>
                  {CAMERA_PRESETS.map((preset) => (
                    <option key={preset} value={preset}>
                      {preset}
                    </option>
                  ))}
                </select>
              </div>

              {/* Lighting */}
              <div>
                <label className="block text-xs text-[var(--muted-foreground)] mb-1">
                  Lighting
                </label>
                <select
                  value={formData.styleSettings?.lighting ?? ''}
                  onChange={(e) => handleStyleChange('lighting', e.target.value)}
                  className="w-full px-2 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                >
                  <option value="">None</option>
                  {LIGHTING_PRESETS.map((preset) => (
                    <option key={preset} value={preset}>
                      {preset}
                    </option>
                  ))}
                </select>
              </div>

              {/* Scene */}
              <div>
                <label className="block text-xs text-[var(--muted-foreground)] mb-1">Scene</label>
                <select
                  value={formData.styleSettings?.scene ?? ''}
                  onChange={(e) => handleStyleChange('scene', e.target.value)}
                  className="w-full px-2 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                >
                  <option value="">None</option>
                  {SCENE_PRESETS.map((preset) => (
                    <option key={preset} value={preset}>
                      {preset}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium mb-1">Tags</label>
            <div className="flex gap-2 mb-2 flex-wrap">
              {formData.tags?.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 bg-[var(--secondary)] rounded text-xs flex items-center gap-1"
                >
                  {tag}
                  <button onClick={() => handleRemoveTag(tag)} className="hover:text-red-400">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                placeholder="Add a tag..."
                className="flex-1 px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              />
              <button
                onClick={handleAddTag}
                className="px-4 py-2 bg-[var(--secondary)] rounded text-sm hover:bg-[var(--border)] transition"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border)] flex justify-end gap-3">
          <button
            onClick={closeCreateModal}
            className="px-4 py-2 bg-[var(--secondary)] rounded text-sm hover:bg-[var(--border)] transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!formData.name || !formData.promptText || isLoading}
            className="px-4 py-2 bg-[var(--primary)] text-white rounded text-sm font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Saving...' : isEditing ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </>
  );
}

export const CreatePromptModal = memo(CreatePromptModalComponent);
