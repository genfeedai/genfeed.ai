'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';

type TextSectionProps = {
  enabledModels: string[];
  defaultModel: string;
  defaultModelReview: string;
  defaultModelUpdate: string;
  onDefaultModelChange: (value: string) => void;
  onDefaultModelReviewChange: (value: string) => void;
  onDefaultModelUpdateChange: (value: string) => void;
};

export default function OrganizationGenerationDefaultsTextSection({
  enabledModels,
  defaultModel,
  defaultModelReview,
  defaultModelUpdate,
  onDefaultModelChange,
  onDefaultModelReviewChange,
  onDefaultModelUpdateChange,
}: TextSectionProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Text Content
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Controls the baseline models used for content writing, review, and
          revision workflows. Brand-level content model overrides can replace
          the generation step for a specific brand.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label
            htmlFor="org-default-content-model"
            className="mb-1 block text-sm font-medium"
          >
            Content Generation Model
          </label>
          <Select
            onValueChange={(value) =>
              onDefaultModelChange(value === 'none' ? '' : value)
            }
            value={defaultModel || 'none'}
          >
            <SelectTrigger id="org-default-content-model" className="w-full">
              <SelectValue placeholder="Select a text model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Use system default</SelectItem>
              {enabledModels.map((model) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label
            htmlFor="org-default-content-review-model"
            className="mb-1 block text-sm font-medium"
          >
            Content Review Model
          </label>
          <Select
            onValueChange={(value) =>
              onDefaultModelReviewChange(value === 'none' ? '' : value)
            }
            value={defaultModelReview || 'none'}
          >
            <SelectTrigger
              id="org-default-content-review-model"
              className="w-full"
            >
              <SelectValue placeholder="Select a review model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Use system default</SelectItem>
              {enabledModels.map((model) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label
            htmlFor="org-default-content-revision-model"
            className="mb-1 block text-sm font-medium"
          >
            Content Revision Model
          </label>
          <Select
            onValueChange={(value) =>
              onDefaultModelUpdateChange(value === 'none' ? '' : value)
            }
            value={defaultModelUpdate || 'none'}
          >
            <SelectTrigger
              id="org-default-content-revision-model"
              className="w-full"
            >
              <SelectValue placeholder="Select a revision model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Use system default</SelectItem>
              {enabledModels.map((model) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Auto keeps the system-selected defaults for each text stage. Use these
        only when you want a workspace-wide override for content writing flows.
      </p>
    </div>
  );
}
