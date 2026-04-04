'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingsField } from '@/components/ui/settings-section';
import { type ProviderType, useSettingsStore } from '@/store/settingsStore';

const IMAGE_MODELS = [
  { description: 'Fast, $0.039/image', label: 'Nano Banana', value: 'nano-banana' },
  {
    description: 'High quality, $0.15-0.30/image',
    label: 'Nano Banana Pro',
    value: 'nano-banana-pro',
  },
];

const VIDEO_MODELS = [
  { description: 'Fast, $0.10-0.15/sec', label: 'Veo 3.1 Fast', value: 'veo-3.1-fast' },
  { description: 'High quality, $0.20-0.40/sec', label: 'Veo 3.1', value: 'veo-3.1' },
];

export function DefaultsTab() {
  const { defaults, setDefaultModel } = useSettingsStore();

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Set default models for new nodes. You can always change models per-node.
      </p>

      <SettingsField label="Default Image Model">
        <Select
          value={defaults.imageModel}
          onValueChange={(value) => setDefaultModel('image', value, defaults.imageProvider)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {IMAGE_MODELS.map((model) => (
              <SelectItem key={model.value} value={model.value}>
                <span>{model.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">{model.description}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsField>

      <SettingsField label="Default Video Model">
        <Select
          value={defaults.videoModel}
          onValueChange={(value) => setDefaultModel('video', value, defaults.videoProvider)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VIDEO_MODELS.map((model) => (
              <SelectItem key={model.value} value={model.value}>
                <span>{model.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">{model.description}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsField>

      <SettingsField
        label="Default Provider"
        description="Replicate is recommended for best model availability and reliability."
      >
        <Select
          value={defaults.imageProvider}
          onValueChange={(value) => {
            const provider = value as ProviderType;
            setDefaultModel('image', defaults.imageModel, provider);
            setDefaultModel('video', defaults.videoModel, provider);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="replicate">Replicate (Recommended)</SelectItem>
            <SelectItem value="fal">fal.ai</SelectItem>
            <SelectItem value="huggingface">Hugging Face</SelectItem>
          </SelectContent>
        </Select>
      </SettingsField>
    </div>
  );
}
