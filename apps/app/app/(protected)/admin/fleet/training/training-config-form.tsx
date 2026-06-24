import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IFleetCharacter } from '@genfeedai/interfaces';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';

const ALL_CHARACTERS_VALUE = '__all-characters__';

type Props = {
  characters: IFleetCharacter[] | undefined;
  selectedCharacter: string;
  baseModel: string;
  steps: number;
  loraRank: number;
  learningRate: number;
  hasMinImages: boolean;
  isStarting: boolean;
  onCharacterChange: (value: string) => void;
  onBaseModelChange: (value: string) => void;
  onStepsChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onLoraRankChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onLearningRateChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onStartTraining: () => void;
};

export default function TrainingConfigForm({
  characters,
  selectedCharacter,
  baseModel,
  steps,
  loraRank,
  learningRate,
  hasMinImages,
  isStarting,
  onCharacterChange,
  onBaseModelChange,
  onStepsChange,
  onLoraRankChange,
  onLearningRateChange,
  onStartTraining,
}: Props) {
  return (
    <WorkspaceSurface
      title="Start New Training"
      tone="muted"
      data-testid="fleet-training-config-surface"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Character Selector */}
          <div>
            <span className="block text-sm font-medium text-foreground/70 mb-1">
              Character
            </span>
            <Select
              onValueChange={(value) =>
                onCharacterChange(value === ALL_CHARACTERS_VALUE ? '' : value)
              }
              value={selectedCharacter || ALL_CHARACTERS_VALUE}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CHARACTERS_VALUE}>
                  Select a character…
                </SelectItem>
                {(characters || []).map((c) => (
                  <SelectItem key={c.id} value={c.slug}>
                    {c.emoji ? `${c.emoji} ` : ''}
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Base Model */}
          <div>
            <span className="block text-sm font-medium text-foreground/70 mb-1">
              Base Model
            </span>
            <Select onValueChange={onBaseModelChange} value={baseModel}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="genfeed-ai/z-image-turbo">
                  Z-Image Turbo (Recommended)
                </SelectItem>
                <SelectItem value="genfeed-ai/z-image-turbo-lora">
                  Z-Image Turbo LoRA
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Steps */}
          <div>
            <span className="block text-sm font-medium text-foreground/70 mb-1">
              Steps
            </span>
            <Input
              className="w-full"
              min={100}
              onChange={onStepsChange}
              type="number"
              value={steps}
            />
          </div>

          {/* LoRA Rank */}
          <div>
            <span className="block text-sm font-medium text-foreground/70 mb-1">
              LoRA Rank
            </span>
            <Input
              className="w-full"
              min={1}
              onChange={onLoraRankChange}
              type="number"
              value={loraRank}
            />
          </div>

          {/* Learning Rate */}
          <div>
            <span className="block text-sm font-medium text-foreground/70 mb-1">
              Learning Rate
            </span>
            <Input
              className="w-full"
              onChange={onLearningRateChange}
              step={0.0001}
              type="number"
              value={learningRate}
            />
          </div>
        </div>

        {/* Warning for insufficient images */}
        {selectedCharacter && !hasMinImages && (
          <div className="mb-4 px-4 py-3 rounded bg-warning/10 text-warning text-sm">
            This character has fewer than 8 selected images. Training may
            produce poor results.
          </div>
        )}

        <Button
          withWrapper={false}
          size={ButtonSize.SM}
          variant={ButtonVariant.DEFAULT}
          isDisabled={!selectedCharacter || isStarting}
          onClick={onStartTraining}
        >
          {isStarting ? 'Starting…' : 'Start Training'}
        </Button>
      </div>
    </WorkspaceSurface>
  );
}
