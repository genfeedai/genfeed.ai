'use client';

import Card from '@ui/card/Card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives';
import { Switch } from '@ui/primitives/switch';

const AUTO_MODEL_SELECT_VALUE = '__auto__';

type AdvancedRoutingCardProps = {
  allowAdvancedOverrides: boolean;
  enabledModels: string[];
  generationModelOverride: string;
  isSaving: boolean;
  onAllowAdvancedOverridesChange: (checked: boolean) => void;
  onGenerationModelOverrideChange: (value: string) => void;
  onReviewModelOverrideChange: (value: string) => void;
  onThinkingModelOverrideChange: (value: string) => void;
  reviewModelOverride: string;
  thinkingModelOverride: string;
};

export default function AdvancedRoutingCard({
  allowAdvancedOverrides,
  enabledModels,
  generationModelOverride,
  isSaving,
  onAllowAdvancedOverridesChange,
  onGenerationModelOverrideChange,
  onReviewModelOverrideChange,
  onThinkingModelOverrideChange,
  reviewModelOverride,
  thinkingModelOverride,
}: AdvancedRoutingCardProps) {
  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-4">Advanced Routing</h2>
      <div className="space-y-4">
        <Switch
          label="Expose Raw Model Overrides"
          description="Enable explicit planner, generation, and review model routing controls for advanced operators."
          isChecked={allowAdvancedOverrides}
          isDisabled={isSaving}
          onChange={(event) =>
            onAllowAdvancedOverridesChange(event.target.checked)
          }
        />

        {allowAdvancedOverrides ? (
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm font-medium">Thinking Model</p>
              <Select
                value={thinkingModelOverride || AUTO_MODEL_SELECT_VALUE}
                onValueChange={(value) =>
                  onThinkingModelOverrideChange(
                    value === AUTO_MODEL_SELECT_VALUE ? '' : value,
                  )
                }
              >
                <SelectTrigger className="w-full mt-2 rounded">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO_MODEL_SELECT_VALUE}>Auto</SelectItem>
                  {enabledModels.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="text-sm font-medium">Generation Model</p>
              <Select
                value={generationModelOverride || AUTO_MODEL_SELECT_VALUE}
                onValueChange={(value) =>
                  onGenerationModelOverrideChange(
                    value === AUTO_MODEL_SELECT_VALUE ? '' : value,
                  )
                }
              >
                <SelectTrigger className="w-full mt-2 rounded">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO_MODEL_SELECT_VALUE}>Auto</SelectItem>
                  {enabledModels.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="text-sm font-medium">Review Model</p>
              <Select
                value={reviewModelOverride || AUTO_MODEL_SELECT_VALUE}
                onValueChange={(value) =>
                  onReviewModelOverrideChange(
                    value === AUTO_MODEL_SELECT_VALUE ? '' : value,
                  )
                }
              >
                <SelectTrigger className="w-full mt-2 rounded">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO_MODEL_SELECT_VALUE}>Auto</SelectItem>
                  {enabledModels.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Keep this off for most teams. Budget / Balanced / High Quality is
            the default control surface.
          </p>
        )}
      </div>
    </Card>
  );
}
