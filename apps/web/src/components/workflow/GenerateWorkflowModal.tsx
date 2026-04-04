'use client';

import { clsx } from 'clsx';
import { AlertCircle, Loader2, Sparkles, X } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@genfeedai/workflow-ui/stores';
import { useWorkflowStore } from '@/store/workflowStore';

// =============================================================================
// TYPES
// =============================================================================

type ContentLevel = 'empty' | 'minimal' | 'full';

interface GeneratorModel {
  id: string;
  name: string;
  provider: string;
  description: string;
  pricing: string; // Display string for cost estimate
}

const GENERATOR_MODELS: GeneratorModel[] = [
  {
    description: 'Fast and capable, good for most workflows',
    id: 'meta/meta-llama-3.1-70b-instruct',
    name: 'Llama 3.1 70B',
    pricing: '~$0.001/generation',
    provider: 'Meta',
  },
  {
    description: 'Latest Llama model with improved reasoning',
    id: 'meta/meta-llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B',
    pricing: '~$0.001/generation',
    provider: 'Meta',
  },
  {
    description: 'Strong reasoning for complex workflows',
    id: 'deepseek-ai/deepseek-r1',
    name: 'DeepSeek R1',
    pricing: '~$0.01/generation',
    provider: 'DeepSeek',
  },
];

const DEFAULT_MODEL = GENERATOR_MODELS[0].id;

interface GeneratedWorkflow {
  name: string;
  description: string;
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle: string;
    targetHandle: string;
  }>;
}

// =============================================================================
// CONTENT LEVEL OPTIONS
// =============================================================================

const CONTENT_LEVELS: { value: ContentLevel; label: string; description: string }[] = [
  {
    description: 'Just the structure, you fill in all content',
    label: 'Empty',
    value: 'empty',
  },
  {
    description: 'Structure with placeholder text to guide you',
    label: 'Placeholders',
    value: 'minimal',
  },
  {
    description: 'AI generates all prompts and settings',
    label: 'Full Content',
    value: 'full',
  },
];

// =============================================================================
// EXAMPLE PROMPTS
// =============================================================================

const EXAMPLE_PROMPTS = [
  'Generate an image from a prompt and convert it to a video',
  'Create a thumbnail and title for a YouTube video',
  'Take an image, upscale it, and add annotations',
  'Generate 3 variations of an image with different aspect ratios',
  'Create a lip-synced avatar video from an audio file',
];

// =============================================================================
// MAIN COMPONENT
// =============================================================================

function GenerateWorkflowModalComponent() {
  const { showAIGenerator, toggleAIGenerator } = useUIStore();
  const { loadWorkflow } = useWorkflowStore();

  const [description, setDescription] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [contentLevel, setContentLevel] = useState<ContentLevel>('minimal');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedWorkflow, setGeneratedWorkflow] = useState<GeneratedWorkflow | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!description.trim()) {
      setError('Please enter a workflow description');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedWorkflow(null);

    try {
      const response = await fetch('/api/workflows/generate', {
        body: JSON.stringify({ contentLevel, description, model }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message ?? 'Failed to generate workflow');
      }

      const workflow = await response.json();
      setGeneratedWorkflow(workflow);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate workflow');
    } finally {
      setIsGenerating(false);
    }
  }, [description, contentLevel, model]);

  const handleApply = useCallback(() => {
    if (!generatedWorkflow) return;

    // Cast to workflow file format - the generated nodes should match the expected structure
    loadWorkflow({
      createdAt: new Date().toISOString(),
      description: generatedWorkflow.description,
      edgeStyle: 'default',
      edges: generatedWorkflow.edges as Parameters<typeof loadWorkflow>[0]['edges'],
      groups: [],
      name: generatedWorkflow.name,
      nodes: generatedWorkflow.nodes as Parameters<typeof loadWorkflow>[0]['nodes'],
      updatedAt: new Date().toISOString(),
      version: 1,
    });

    // Reset and close
    setDescription('');
    setGeneratedWorkflow(null);
    toggleAIGenerator();
  }, [generatedWorkflow, loadWorkflow, toggleAIGenerator]);

  const handleClose = useCallback(() => {
    setDescription('');
    setGeneratedWorkflow(null);
    setError(null);
    toggleAIGenerator();
  }, [toggleAIGenerator]);

  if (!showAIGenerator) return null;

  return (
    <div className="fixed right-0 top-14 z-40 flex h-[calc(100vh-3.5rem)] w-96 flex-col border-l border-border bg-card shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-foreground">AI Workflow Generator</h2>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={handleClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {/* Description Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Describe your workflow</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., Generate an image from a prompt and convert it to a short video"
            className="min-h-[120px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            disabled={isGenerating}
          />
        </div>

        {/* Model Selection */}
        <div className="mt-4 space-y-2">
          <label className="text-sm font-medium text-foreground">Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            disabled={isGenerating}
          >
            {GENERATOR_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.provider}) - {m.pricing}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {GENERATOR_MODELS.find((m) => m.id === model)?.description}
          </p>
        </div>

        {/* Example Prompts */}
        <div className="mt-4 space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Examples</label>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => setDescription(prompt)}
                className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition hover:border-primary hover:text-foreground"
                disabled={isGenerating}
              >
                {prompt.length > 40 ? `${prompt.slice(0, 40)}...` : prompt}
              </button>
            ))}
          </div>
        </div>

        {/* Content Level */}
        <div className="mt-6 space-y-2">
          <label className="text-sm font-medium text-foreground">Content Level</label>
          <div className="space-y-2">
            {CONTENT_LEVELS.map(({ value, label, description: desc }) => (
              <button
                key={value}
                onClick={() => setContentLevel(value)}
                className={clsx(
                  'w-full rounded-md border p-3 text-left transition',
                  contentLevel === value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground'
                )}
                disabled={isGenerating}
              >
                <div className="text-sm font-medium text-foreground">{label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Generated Workflow Preview */}
        {generatedWorkflow && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Generated Workflow</label>
              <span className="text-xs text-muted-foreground">
                {generatedWorkflow.nodes.length} nodes, {generatedWorkflow.edges.length} edges
              </span>
            </div>

            <div className="rounded-md border border-border bg-background p-3">
              <h3 className="font-medium text-foreground">{generatedWorkflow.name}</h3>
              {generatedWorkflow.description && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {generatedWorkflow.description}
                </p>
              )}

              <div className="mt-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Nodes</p>
                <div className="flex flex-wrap gap-1">
                  {generatedWorkflow.nodes.map((node) => (
                    <span
                      key={node.id}
                      className="rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                    >
                      {String(node.data.label ?? node.type)}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <Button onClick={handleApply} className="w-full">
              <Sparkles className="mr-2 h-4 w-4" />
              Apply to Canvas
            </Button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border p-4">
        <Button
          onClick={handleGenerate}
          disabled={isGenerating || !description.trim()}
          className="w-full"
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Workflow
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export const GenerateWorkflowModal = memo(GenerateWorkflowModalComponent);
