'use client';

import {
  selectUpdateNodeData,
  useWorkflowStore,
} from '@genfeedai/workflow-ui/stores';
import type {
  HookFormula,
  HookGeneratorNodeData,
  HookToneStyle,
} from '@genfeedai/workflows/nodes';
import type { NodeProps } from '@xyflow/react';
import { Zap } from 'lucide-react';
import { memo, useCallback } from 'react';
import { NodeBadge } from '@/features/workflows/components/ui/badge';
import { NodeCard, NodeHeader } from '@/features/workflows/components/ui/card';
import {
  NodeInput,
  NodeSelect,
} from '@/features/workflows/components/ui/inputs';
import {
  HelpText,
  ProcessingMessage,
} from '@/features/workflows/components/ui/status';
import { coerceNodeData } from '@/features/workflows/nodes/node-data';

const HOOK_FORMULA_OPTIONS: Array<{ label: string; value: HookFormula }> = [
  { label: 'Curiosity gap', value: 'curiosity_gap' },
  {
    label: 'Conflict resolution',
    value: 'person_conflict_resolution',
  },
  { label: 'List reveal', value: 'list_reveal' },
  { label: 'Transformation', value: 'transformation' },
  { label: 'Challenge', value: 'challenge' },
];

const TONE_STYLE_OPTIONS: Array<{ label: string; value: HookToneStyle }> = [
  { label: 'Storytelling', value: 'storytelling' },
  { label: 'Provocative', value: 'provocative' },
  { label: 'Educational', value: 'educational' },
  { label: 'Humorous', value: 'humorous' },
  { label: 'Dramatic', value: 'dramatic' },
];

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function HookGeneratorNodeComponent(props: NodeProps): React.JSX.Element {
  const { id } = props;
  const data = coerceNodeData<HookGeneratorNodeData>(
    props.data,
    hookGeneratorNodeDefaults,
  );
  const updateNodeData = useWorkflowStore(selectUpdateNodeData);

  const handleNicheChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { niche: emptyToNull(event.target.value) });
    },
    [id, updateNodeData],
  );

  const handleProductChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { product: emptyToNull(event.target.value) });
    },
    [id, updateNodeData],
  );

  const handleFormulaChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, { hookFormula: event.target.value as HookFormula });
    },
    [id, updateNodeData],
  );

  const handleToneChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, { toneStyle: event.target.value as HookToneStyle });
    },
    [id, updateNodeData],
  );

  const outputHashtags = Array.isArray(data.outputHashtags)
    ? data.outputHashtags
    : [];
  const outputSlidePrompts = Array.isArray(data.outputSlidePrompts)
    ? data.outputSlidePrompts
    : [];
  const hasOutput =
    Boolean(data.outputHookText) ||
    Boolean(data.outputCaptionHook) ||
    outputHashtags.length > 0 ||
    outputSlidePrompts.length > 0;

  return (
    <NodeCard>
      <NodeHeader
        icon={<Zap className="size-4" />}
        title="Hook Generator"
        badge={<NodeBadge variant="purple">SaaS</NodeBadge>}
      />

      <div className="grid grid-cols-2 gap-2">
        <NodeInput
          label="Niche"
          value={data.niche ?? ''}
          onChange={handleNicheChange}
          placeholder="AI creators"
        />
        <NodeInput
          label="Product"
          value={data.product ?? ''}
          onChange={handleProductChange}
          placeholder="Workflow automation"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NodeSelect
          label="Formula"
          value={data.hookFormula}
          onChange={handleFormulaChange}
        >
          {HOOK_FORMULA_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NodeSelect>
        <NodeSelect
          label="Tone"
          value={data.toneStyle}
          onChange={handleToneChange}
        >
          {TONE_STYLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NodeSelect>
      </div>

      {data.status === 'processing' && (
        <ProcessingMessage message="Generating hook set..." />
      )}

      {hasOutput ? (
        <div className="space-y-2 border border-white/[0.08] bg-muted/30 p-2">
          {data.outputHookText && (
            <p className="text-xs font-medium">{data.outputHookText}</p>
          )}
          {data.outputCaptionHook && (
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {data.outputCaptionHook}
            </p>
          )}
          {outputHashtags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {outputHashtags.map((hashtag) => (
                <span
                  key={hashtag}
                  className="rounded-full border border-border/80 bg-secondary/40 px-2 py-0.5 text-[10px] text-muted-foreground"
                >
                  {hashtag}
                </span>
              ))}
            </div>
          )}
          {outputSlidePrompts.length > 0 && (
            <p className="text-[10px] text-muted-foreground">
              {outputSlidePrompts.length} slide prompts ready
            </p>
          )}
        </div>
      ) : (
        <HelpText>
          Connect trend or brand context to generate hooks at execution time
        </HelpText>
      )}
    </NodeCard>
  );
}

export const HookGeneratorNode = memo(HookGeneratorNodeComponent);

const hookGeneratorNodeDefaults: Partial<HookGeneratorNodeData> = {
  hookFormula: 'curiosity_gap',
  inputBrandContext: null,
  inputTrendData: null,
  label: 'Hook Generator',
  niche: null,
  outputCaptionHook: null,
  outputHashtags: [],
  outputHookText: null,
  outputSlidePrompts: [],
  product: null,
  status: 'idle',
  toneStyle: 'storytelling',
  type: 'hookGenerator',
};
