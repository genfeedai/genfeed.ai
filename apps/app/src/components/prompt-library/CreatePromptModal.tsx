'use client';

import { ButtonVariant } from '@genfeedai/enums';
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
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
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
    (
      field: keyof ICreatePrompt,
      value: string | string[] | Record<string, string>,
    ) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    [],
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
      logger.error('Failed to save prompt', error, {
        context: 'CreatePromptModal',
      });
    }
  }, [formData, isEditing, editingItem, createItem, updateItem]);

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-[60]"
        onClick={closeCreateModal}
      />
      <div className="fixed inset-10 z-[60] flex flex-col overflow-hidden rounded-xl bg-[var(--card)] shadow-xl md:inset-20 lg:inset-x-40">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            {isEditing ? 'Edit Prompt' : 'Create New Prompt'}
          </h2>
          <Button
            variant={ButtonVariant.GHOST}
            withWrapper={false}
            onClick={closeCreateModal}
            className="p-2 hover:bg-[var(--secondary)] rounded transition"
            icon={<X className="w-5 h-5" />}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <Input
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="e.g., Cinematic Product Ad"
                className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <Select
                value={formData.category}
                onValueChange={(value) =>
                  handleChange('category', value as PromptCategory)
                }
              >
                <SelectTrigger className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Prompt Text */}
          <div>
            <label className="block text-sm font-medium mb-1">Prompt *</label>
            <Textarea
              value={formData.promptText}
              onChange={(e) => handleChange('promptText', e.target.value)}
              placeholder="Enter your prompt text..."
              rows={4}
              className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Description
            </label>
            <Textarea
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
                <label className="block text-xs text-[var(--muted-foreground)] mb-1">
                  Mood
                </label>
                <Select
                  value={formData.styleSettings?.mood ?? ''}
                  onValueChange={(value) => handleStyleChange('mood', value)}
                >
                  <SelectTrigger className="w-full px-2 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {MOOD_PRESETS.map((preset) => (
                      <SelectItem key={preset} value={preset}>
                        {preset}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Style */}
              <div>
                <label className="block text-xs text-[var(--muted-foreground)] mb-1">
                  Style
                </label>
                <Select
                  value={formData.styleSettings?.style ?? ''}
                  onValueChange={(value) => handleStyleChange('style', value)}
                >
                  <SelectTrigger className="w-full px-2 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {STYLE_PRESETS.map((preset) => (
                      <SelectItem key={preset} value={preset}>
                        {preset}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Camera */}
              <div>
                <label className="block text-xs text-[var(--muted-foreground)] mb-1">
                  Camera
                </label>
                <Select
                  value={formData.styleSettings?.camera ?? ''}
                  onValueChange={(value) => handleStyleChange('camera', value)}
                >
                  <SelectTrigger className="w-full px-2 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {CAMERA_PRESETS.map((preset) => (
                      <SelectItem key={preset} value={preset}>
                        {preset}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Lighting */}
              <div>
                <label className="block text-xs text-[var(--muted-foreground)] mb-1">
                  Lighting
                </label>
                <Select
                  value={formData.styleSettings?.lighting ?? ''}
                  onValueChange={(value) =>
                    handleStyleChange('lighting', value)
                  }
                >
                  <SelectTrigger className="w-full px-2 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {LIGHTING_PRESETS.map((preset) => (
                      <SelectItem key={preset} value={preset}>
                        {preset}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Scene */}
              <div>
                <label className="block text-xs text-[var(--muted-foreground)] mb-1">
                  Scene
                </label>
                <Select
                  value={formData.styleSettings?.scene ?? ''}
                  onValueChange={(value) => handleStyleChange('scene', value)}
                >
                  <SelectTrigger className="w-full px-2 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {SCENE_PRESETS.map((preset) => (
                      <SelectItem key={preset} value={preset}>
                        {preset}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  <Button
                    variant={ButtonVariant.UNSTYLED}
                    withWrapper={false}
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-red-400"
                    icon={<X className="w-3 h-3" />}
                  />
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                placeholder="Add a tag..."
                className="flex-1 px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              />
              <Button
                variant={ButtonVariant.SECONDARY}
                withWrapper={false}
                onClick={handleAddTag}
                className="px-4 py-2 bg-[var(--secondary)] rounded text-sm hover:bg-[var(--border)] transition"
              >
                Add
              </Button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border)] flex justify-end gap-3">
          <Button
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
            onClick={closeCreateModal}
            className="px-4 py-2 bg-[var(--secondary)] rounded text-sm hover:bg-[var(--border)] transition"
          >
            Cancel
          </Button>
          <Button
            variant={ButtonVariant.DEFAULT}
            withWrapper={false}
            onClick={handleSubmit}
            isDisabled={!formData.name || !formData.promptText || isLoading}
            className="px-4 py-2 bg-[var(--primary)] text-white rounded text-sm font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Saving...' : isEditing ? 'Update' : 'Create'}
          </Button>
        </div>
      </div>
    </>
  );
}

export const CreatePromptModal = memo(CreatePromptModalComponent);
