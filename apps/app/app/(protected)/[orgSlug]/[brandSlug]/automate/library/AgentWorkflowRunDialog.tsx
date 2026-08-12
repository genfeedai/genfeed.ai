'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type {
  AgentStrategy,
  AgentStrategyWorkflowBinding,
  RunAgentStrategyWorkflowInput,
} from '@services/automation/agent-strategies.service';
import { ImagesService } from '@services/ingredients/images.service';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { Workflow } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  buildAgentWorkflowRunInput,
  type WorkflowIngredientSelection,
} from './agent-workflow-run-input.util';

export interface AgentWorkflowRunDialogProps {
  binding: AgentStrategyWorkflowBinding | null;
  isLoadingBinding: boolean;
  isOpen: boolean;
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: RunAgentStrategyWorkflowInput) => Promise<void>;
  strategy: AgentStrategy | null;
}

const NONE_INGREDIENT = '__none__';

function resolveIngredientUrl(row: Record<string, unknown>): string {
  for (const key of [
    'url',
    'src',
    'imageUrl',
    'cdnUrl',
    'publicUrl',
  ] as const) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  const file = row.file;
  if (file && typeof file === 'object' && !Array.isArray(file)) {
    const fileUrl = (file as Record<string, unknown>).url;
    if (typeof fileUrl === 'string' && fileUrl.trim()) {
      return fileUrl.trim();
    }
  }
  return '';
}

function resolveIngredientLabel(
  row: Record<string, unknown>,
  fallbackId: string,
): string {
  for (const key of ['label', 'name', 'title', 'prompt'] as const) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim().slice(0, 80);
    }
  }
  return fallbackId.slice(0, 12);
}

export default function AgentWorkflowRunDialog({
  binding,
  isLoadingBinding,
  isOpen,
  isSubmitting,
  onOpenChange,
  onSubmit,
  strategy,
}: AgentWorkflowRunDialogProps) {
  const [topic, setTopic] = useState('');
  const [prompt, setPrompt] = useState('');
  const [referenceImage, setReferenceImage] = useState('');
  const [cta, setCta] = useState('');
  const [selectedIngredientId, setSelectedIngredientId] =
    useState(NONE_INGREDIENT);
  const [libraryImages, setLibraryImages] = useState<
    WorkflowIngredientSelection[]
  >([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);

  const getImagesService = useAuthedService((token: string) =>
    ImagesService.getInstance(token),
  );

  useEffect(() => {
    if (!isOpen || !strategy) {
      return;
    }

    const defaultTopic =
      (Array.isArray(strategy.topics) && strategy.topics[0]) ||
      strategy.label ||
      '';
    setTopic(defaultTopic);
    setPrompt(strategy.voice || '');
    setReferenceImage('');
    setCta('');
    setSelectedIngredientId(NONE_INGREDIENT);
  }, [isOpen, strategy]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function loadLibrary() {
      setIsLoadingLibrary(true);
      try {
        const service = await getImagesService();
        if (cancelled || controller.signal.aborted) {
          return;
        }
        const brandId = strategy?.brandId ?? strategy?.brand?.id;
        const rows = await service.findAll(
          brandId ? { brandId, limit: 40 } : { limit: 40 },
        );
        if (cancelled || controller.signal.aborted) {
          return;
        }
        const list = (Array.isArray(rows) ? rows : []).flatMap((row) => {
          const record = row as unknown as Record<string, unknown>;
          const id =
            typeof record.id === 'string'
              ? record.id
              : typeof row.id === 'string'
                ? row.id
                : '';
          const url = resolveIngredientUrl(record);
          if (!id || !url) {
            return [];
          }
          return [
            {
              id,
              label: resolveIngredientLabel(record, id),
              url,
            } satisfies WorkflowIngredientSelection,
          ];
        });
        setLibraryImages(list);
      } catch {
        if (!cancelled) {
          setLibraryImages([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingLibrary(false);
        }
      }
    }

    void loadLibrary();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [getImagesService, isOpen, strategy?.brand?.id, strategy?.brandId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const selected =
      selectedIngredientId === NONE_INGREDIENT
        ? null
        : (libraryImages.find((item) => item.id === selectedIngredientId) ??
          null);

    await onSubmit(
      buildAgentWorkflowRunInput({
        cta,
        prompt,
        referenceImageUrl: referenceImage,
        selectedIngredient: selected,
        topic,
      }),
    );
  }

  const missing = binding?.missingRequiredKeys ?? [];
  const workflowLabel =
    binding?.workflowLabel ||
    binding?.preferredWorkflowTemplateId ||
    'Default content workflow';

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Workflow className="size-4" />
            Run workflow
          </DialogTitle>
          <DialogDescription>
            {strategy
              ? `Fill prompt slots for ${strategy.label}, then run the bound deterministic workflow.`
              : 'Fill prompt slots and run the agent workflow.'}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="rounded bg-foreground/5 px-3 py-2 text-xs text-foreground/70">
            {isLoadingBinding ? (
              <span>Loading workflow binding…</span>
            ) : (
              <>
                <span className="font-medium text-foreground">
                  {workflowLabel}
                </span>
                {binding?.templateDescription ? (
                  <p className="mt-1 text-foreground/50">
                    {binding.templateDescription}
                  </p>
                ) : null}
                {missing.length > 0 ? (
                  <p className="mt-1 text-warning">
                    Still needs: {missing.join(', ')}
                  </p>
                ) : (
                  <p className="mt-1 text-success">
                    Required slots can be filled from this form + agent
                    defaults.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Topic</span>
            <Input
              id="agent-workflow-topic"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="What should this run be about?"
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              Prompt / script / angle
            </span>
            <Textarea
              id="agent-workflow-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Optional: override voice, angle, or full script"
              rows={4}
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              Reference image from library
            </span>
            <Select
              value={selectedIngredientId}
              onValueChange={setSelectedIngredientId}
            >
              <SelectTrigger aria-label="Library image for workflow reference">
                <SelectValue
                  placeholder={
                    isLoadingLibrary
                      ? 'Loading library…'
                      : 'Pick a brand library image'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_INGREDIENT}>None (use URL)</SelectItem>
                {libraryImages.map((image) => (
                  <SelectItem key={image.id} value={image.id}>
                    {image.label || image.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {libraryImages.length === 0 && !isLoadingLibrary ? (
              <p className="text-xs text-foreground/50">
                No library images found — paste a URL below or upload in Library
                first.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              Reference image URL (optional fallback)
            </span>
            <Input
              id="agent-workflow-asset"
              value={referenceImage}
              onChange={(event) => setReferenceImage(event.target.value)}
              placeholder="https://… if not using a library image"
              disabled={selectedIngredientId !== NONE_INGREDIENT}
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              CTA (optional)
            </span>
            <Input
              id="agent-workflow-cta"
              value={cta}
              onChange={(event) => setCta(event.target.value)}
              placeholder="Follow for more"
            />
          </div>

          {binding && binding.inputs.length > 0 ? (
            <div className="max-h-32 overflow-y-auto rounded border border-foreground/10 p-2 text-xs text-foreground/60">
              <p className="mb-1 font-medium text-foreground/80">
                Workflow slots
              </p>
              <ul className="space-y-1">
                {binding.inputs.map((input) => (
                  <li key={input.key} className="flex justify-between gap-2">
                    <span>
                      {input.label}
                      {input.required ? ' *' : ''}
                    </span>
                    <span className="truncate text-foreground/40">
                      {input.filledValue != null && input.filledValue !== ''
                        ? String(input.filledValue)
                        : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              label="Cancel"
              type="button"
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              onClick={() => onOpenChange(false)}
            />
            <Button
              label={isSubmitting ? 'Starting…' : 'Run workflow'}
              type="submit"
              size={ButtonSize.SM}
              variant={ButtonVariant.DEFAULT}
              disabled={isSubmitting || isLoadingBinding}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
