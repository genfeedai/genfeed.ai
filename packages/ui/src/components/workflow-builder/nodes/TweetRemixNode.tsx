'use client';

import { ButtonVariant, WorkflowNodeStatus } from '@genfeedai/enums';
import Button from '@ui/buttons/base/Button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Slider } from '@ui/primitives/slider';
import { Check, RefreshCw, Sparkles } from 'lucide-react';
import { memo, useCallback } from 'react';

export type TweetTone = 'professional' | 'casual' | 'witty' | 'viral';

export interface TweetVariation {
  id: string;
  text: string;
  charCount: number;
}

export interface TweetRemixNodeData {
  label: string;
  status: WorkflowNodeStatus;
  inputTweet: string | null;
  variations: TweetVariation[];
  selectedIndex: number | null;
  outputTweet: string | null;
  tone: TweetTone;
  maxLength: number;
  jobId: string | null;
}

interface TweetRemixNodeProps {
  id: string;
  data: TweetRemixNodeData;
  onUpdate: (id: string, data: Partial<TweetRemixNodeData>) => void;
  onExecute: (id: string) => void;
}

const TONE_OPTIONS: { value: TweetTone; label: string }[] = [
  { label: 'Professional', value: 'professional' },
  { label: 'Casual', value: 'casual' },
  { label: 'Witty', value: 'witty' },
  { label: 'Viral', value: 'viral' },
];

function TweetRemixNodeComponent({
  id,
  data,
  onUpdate,
  onExecute,
}: TweetRemixNodeProps) {
  const handleSelectVariation = useCallback(
    (index: number) => {
      const variation = data.variations[index];
      onUpdate(id, {
        outputTweet: variation?.text || null,
        selectedIndex: index,
      });
    },
    [id, data.variations, onUpdate],
  );

  const handleGenerate = useCallback(() => {
    onExecute(id);
  }, [id, onExecute]);

  return (
    <div className="space-y-3">
      {/* Tone Selector */}
      <div>
        <label className="text-xs text-muted-foreground">Tone</label>
        <Select
          value={data.tone}
          onValueChange={(value) => onUpdate(id, { tone: value as TweetTone })}
        >
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Select a tone" />
          </SelectTrigger>
          <SelectContent>
            {TONE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Max Length Slider */}
      <div>
        <label className="text-xs text-muted-foreground">
          Max Length: {data.maxLength}
        </label>
        <Slider
          min={100}
          max={280}
          step={10}
          value={[data.maxLength]}
          onValueChange={([value]) => onUpdate(id, { maxLength: value })}
          className="mt-1"
        />
      </div>

      {/* Input Tweet Preview */}
      {data.inputTweet && (
        <div className="p-2 bg-background border border-white/[0.08]">
          <div className="text-xs text-muted-foreground mb-1">Original</div>
          <div className="text-sm text-foreground line-clamp-2">
            {data.inputTweet}
          </div>
        </div>
      )}

      {/* Variations */}
      {data.variations.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            Select a variation
          </div>
          {data.variations.map((variation, index) => (
            <Button
              key={variation.id}
              onClick={() => handleSelectVariation(index)}
              type="button"
              variant={ButtonVariant.UNSTYLED}
              className={`w-full p-2 text-left border transition ${
                data.selectedIndex === index
                  ? 'border-primary bg-primary/10'
                  : 'border-white/[0.08] bg-background hover:border-primary/50'
              }`}
            >
              <div className="flex items-start gap-2">
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                    data.selectedIndex === index
                      ? 'border-primary bg-primary'
                      : 'border-white/[0.08]'
                  }`}
                >
                  {data.selectedIndex === index && (
                    <Check className="w-2.5 h-2.5 text-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-foreground">
                    {variation.text}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {variation.charCount} characters
                  </div>
                </div>
              </div>
            </Button>
          ))}
        </div>
      )}

      {/* Generate / Regenerate Button */}
      {data.status !== WorkflowNodeStatus.PROCESSING && (
        <Button
          onClick={handleGenerate}
          type="button"
          variant={ButtonVariant.UNSTYLED}
          className="w-full py-2 bg-primary text-white text-sm font-medium hover:opacity-90 transition flex items-center justify-center gap-2"
        >
          {data.variations.length > 0 ? (
            <>
              <RefreshCw className="w-4 h-4" />
              Regenerate
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate Variations
            </>
          )}
        </Button>
      )}
    </div>
  );
}

export const TweetRemixNode = memo(TweetRemixNodeComponent);
