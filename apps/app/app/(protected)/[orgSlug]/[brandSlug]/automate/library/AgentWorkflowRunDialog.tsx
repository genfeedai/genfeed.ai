'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type {
  AgentStrategy,
  AgentStrategyWorkflowBinding,
  RunAgentStrategyWorkflowInput,
} from '@services/automation/agent-strategies.service';
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
import { Textarea } from '@ui/primitives/textarea';
import { Workflow } from 'lucide-react';
import { useEffect, useState } from 'react';

export interface AgentWorkflowRunDialogProps {
  binding: AgentStrategyWorkflowBinding | null;
  isLoadingBinding: boolean;
  isOpen: boolean;
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: RunAgentStrategyWorkflowInput) => Promise<void>;
  strategy: AgentStrategy | null;
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
  }, [isOpen, strategy]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await onSubmit({
      cta: cta.trim() || undefined,
      prompt: prompt.trim() || undefined,
      referenceImage: referenceImage.trim() || undefined,
      topic: topic.trim() || undefined,
    });
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
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="agent-workflow-topic"
            >
              Topic
            </label>
            <Input
              id="agent-workflow-topic"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="What should this run be about?"
            />
          </div>

          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="agent-workflow-prompt"
            >
              Prompt / script / angle
            </label>
            <Textarea
              id="agent-workflow-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Optional: override voice, angle, or full script"
              rows={4}
            />
          </div>

          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="agent-workflow-asset"
            >
              Reference image URL (optional)
            </label>
            <Input
              id="agent-workflow-asset"
              value={referenceImage}
              onChange={(event) => setReferenceImage(event.target.value)}
              placeholder="https://… or ingredient URL"
            />
          </div>

          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="agent-workflow-cta"
            >
              CTA (optional)
            </label>
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
