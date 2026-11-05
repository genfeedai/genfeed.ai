import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { ImagesService } from '@services/ingredients/images.service';
import { Alert } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { Form } from '@ui/primitives/form';
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
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import type { AgentWorkflowRunDialogProps } from '@/features/automation/props/agent-workflow-run-dialog.props';
import {
  buildAgentWorkflowRunInput,
  listEditableExtraSlots,
  listUnfilledRequiredAfterForm,
  seedExtraInputsFromBinding,
  type WorkflowIngredientSelection,
} from './agent-workflow-run-input.util';

const NONE_INGREDIENT = '__none__';
const LIBRARY_IMAGE_LIMIT = 40;
const EMPTY_LIBRARY_IMAGES: WorkflowIngredientSelection[] = [];

function resolveIngredientUrl(row: Record<string, unknown>): string {
  for (const key of [
    'ingredientUrl',
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
    const fileRecord = file as Record<string, unknown>;
    for (const key of ['url', 'cdnUrl', 'publicUrl'] as const) {
      const fileUrl = fileRecord[key];
      if (typeof fileUrl === 'string' && fileUrl.trim()) {
        return fileUrl.trim();
      }
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

function toLibraryImages(rows: unknown): WorkflowIngredientSelection[] {
  return (Array.isArray(rows) ? rows : []).flatMap((row: unknown) => {
    if (!row || typeof row !== 'object') {
      return [];
    }
    const record = row as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : '';
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
  const translate = useTranslations('common.automation.workflowRun');
  const [topic, setTopic] = useState('');
  const [prompt, setPrompt] = useState('');
  const [referenceImage, setReferenceImage] = useState('');
  const [cta, setCta] = useState('');
  const [extraInputs, setExtraInputs] = useState<Record<string, string>>({});
  const [selectedIngredientId, setSelectedIngredientId] =
    useState(NONE_INGREDIENT);
  // The brand's library images are cached per viewer and brand, so reopening
  // the dialog lists them at once and refreshes them in the background.
  const libraryBrandId = strategy?.brandId ?? strategy?.brand?.id ?? null;
  const libraryQuery = useAuthedQuery<
    ImagesService,
    WorkflowIngredientSelection[]
  >({
    enabled: isOpen,
    queryFn: async (service, signal) => {
      const rows = await service.findAll(
        libraryBrandId
          ? { brandId: libraryBrandId, limit: LIBRARY_IMAGE_LIMIT }
          : { limit: LIBRARY_IMAGE_LIMIT },
        signal,
      );
      return toLibraryImages(rows);
    },
    queryKey: [
      'agent-workflow-run-library-images',
      libraryBrandId,
      { limit: LIBRARY_IMAGE_LIMIT },
    ],
    service: (token: string) => ImagesService.getInstance(token),
  });
  const libraryImages = libraryQuery.data ?? EMPTY_LIBRARY_IMAGES;
  const isLoadingLibrary = libraryQuery.isLoading;

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
    setExtraInputs({});
  }, [isOpen, strategy]);

  useEffect(() => {
    if (!isOpen || !binding) {
      return;
    }
    setExtraInputs(seedExtraInputsFromBinding(binding.inputs));
  }, [binding, isOpen]);

  const extraSlots = useMemo(
    () => listEditableExtraSlots(binding?.inputs),
    [binding?.inputs],
  );

  const formState = useMemo(
    () => ({
      cta,
      extraInputs,
      prompt,
      referenceImageUrl: referenceImage,
      selectedIngredient:
        selectedIngredientId === NONE_INGREDIENT
          ? null
          : (libraryImages.find((item) => item.id === selectedIngredientId) ??
            null),
      topic,
    }),
    [
      cta,
      extraInputs,
      libraryImages,
      prompt,
      referenceImage,
      selectedIngredientId,
      topic,
    ],
  );

  const unfilledRequired = useMemo(
    () => listUnfilledRequiredAfterForm(binding?.inputs, formState),
    [binding?.inputs, formState],
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (unfilledRequired.length > 0) {
      return;
    }

    await onSubmit(buildAgentWorkflowRunInput(formState));
  }

  const missing = binding?.missingRequiredKeys ?? [];
  const workflowLabel =
    binding?.workflowLabel ||
    binding?.preferredWorkflowTemplateId ||
    translate('defaultWorkflow');
  const canSubmit =
    !isSubmitting && !isLoadingBinding && unfilledRequired.length === 0;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Workflow className="size-4" />
            {translate('title')}
          </DialogTitle>
          <DialogDescription>
            {strategy
              ? `Fill prompt slots for ${strategy.label}, then run the bound deterministic workflow.`
              : 'Fill prompt slots and run the agent workflow.'}
          </DialogDescription>
        </DialogHeader>

        <Form onSubmit={handleSubmit}>
          <Alert size="sm" variant="note">
            {isLoadingBinding ? (
              <span>{translate('loading')}</span>
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
                {unfilledRequired.length > 0 ? (
                  <p className="mt-1 text-warning">
                    {translate('requiredMissing', {
                      slots: unfilledRequired.join(', '),
                    })}
                  </p>
                ) : missing.length > 0 ? (
                  <p className="mt-1 text-foreground/50">
                    {translate('bindingPreview', {
                      slots: missing.join(', '),
                    })}
                  </p>
                ) : (
                  <p className="mt-1 text-success">
                    {translate('requiredReady')}
                  </p>
                )}
              </>
            )}
          </Alert>

          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              {translate('fields.topic')}
            </span>
            <Input
              id="agent-workflow-topic"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="What should this run be about?"
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              {translate('fields.prompt')}
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
              {translate('fields.referenceLibrary')}
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
                <SelectItem value={NONE_INGREDIENT}>
                  {translate('fields.noLibraryImage')}
                </SelectItem>
                {libraryImages.map((image) => (
                  <SelectItem key={image.id} value={image.id}>
                    {image.label || image.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {libraryImages.length === 0 && !isLoadingLibrary ? (
              <p className="text-xs text-foreground/50">
                {translate('fields.noImages')}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              {translate('fields.referenceUrl')}
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
              {translate('fields.cta')}
            </span>
            <Input
              id="agent-workflow-cta"
              value={cta}
              onChange={(event) => setCta(event.target.value)}
              placeholder="Follow for more"
            />
          </div>

          {extraSlots.length > 0 ? (
            <div className="space-y-3 rounded border border-foreground/10 p-3">
              <p className="text-sm font-medium text-foreground">
                {translate('fields.additionalSlots')}
              </p>
              {extraSlots.map((slot) => (
                <div key={slot.key} className="space-y-1">
                  <span className="text-xs font-medium text-foreground/80">
                    {slot.label || slot.key}
                    {slot.required ? ' *' : ''}
                  </span>
                  {slot.description ? (
                    <p className="text-xs text-muted-foreground">
                      {slot.description}
                    </p>
                  ) : null}
                  <Input
                    id={`agent-workflow-slot-${slot.key}`}
                    value={extraInputs[slot.key] ?? ''}
                    onChange={(event) =>
                      setExtraInputs((prev) => ({
                        ...prev,
                        [slot.key]: event.target.value,
                      }))
                    }
                    placeholder={slot.key}
                    aria-label={slot.label || slot.key}
                  />
                </div>
              ))}
            </div>
          ) : null}

          {binding && binding.inputs.length > 0 ? (
            <div className="max-h-28 overflow-y-auto rounded border border-foreground/10 p-2 text-xs text-foreground/60">
              <p className="mb-1 font-medium text-foreground/80">
                {translate('fields.slotPreview')}
              </p>
              <ul className="space-y-1">
                {binding.inputs.map((input) => (
                  <li key={input.key} className="flex justify-between gap-2">
                    <span>
                      {input.label}
                      {input.required ? ' *' : ''}
                    </span>
                    <span className="truncate text-muted-foreground">
                      {extraInputs[input.key]?.trim() ||
                        (input.filledValue != null && input.filledValue !== ''
                          ? String(input.filledValue)
                          : '—')}
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
              variant={ButtonVariant.GHOST}
              onClick={() => onOpenChange(false)}
            />
            <Button
              label={isSubmitting ? 'Starting…' : 'Run workflow'}
              type="submit"
              size={ButtonSize.SM}
              variant={ButtonVariant.DEFAULT}
              disabled={!canSubmit}
            />
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
