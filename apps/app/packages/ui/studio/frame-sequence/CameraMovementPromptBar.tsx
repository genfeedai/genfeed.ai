'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { CameraMovementPreset } from '@genfeedai/interfaces/studio/camera-movement.interface';
import type { CameraMovementPromptBarProps } from '@props/studio/camera-movement-prompt-bar.props';
import Card from '@ui/card/Card';
import FormInput from '@ui/forms/inputs/input/form-input/FormInput';
import FormDropdown from '@ui/forms/selectors/dropdown/form-dropdown/FormDropdown';
import { HiVideoCamera } from 'react-icons/hi2';

const CAMERA_PRESETS = [
  { key: 'static', label: 'Static (No Movement)' },
  { key: 'pan-left', label: 'Pan Left' },
  { key: 'pan-right', label: 'Pan Right' },
  { key: 'tilt-up', label: 'Tilt Up' },
  { key: 'tilt-down', label: 'Tilt Down' },
  { key: 'zoom-in', label: 'Zoom In' },
  { key: 'zoom-out', label: 'Zoom Out' },
  { key: 'dolly-forward', label: 'Dolly Forward' },
  { key: 'dolly-back', label: 'Dolly Back' },
  { key: 'truck-left', label: 'Truck Left' },
  { key: 'truck-right', label: 'Truck Right' },
  { key: 'crane-up', label: 'Crane Up' },
  { key: 'crane-down', label: 'Crane Down' },
  { key: 'rotate-clockwise', label: 'Rotate Clockwise' },
  { key: 'rotate-counter-clockwise', label: 'Rotate Counter-clockwise' },
  { key: 'custom', label: 'Custom Prompt' },
] as const;

const PRESET_PROMPTS: Record<CameraMovementPreset, string> = {
  'crane-down': 'smooth crane down, descending vertically',
  'crane-up': 'smooth crane up, rising vertically',
  custom: '',
  'dolly-back': 'smooth dolly back, moving away from subject',
  'dolly-forward': 'smooth dolly forward, moving closer to subject',
  'pan-left': 'smooth pan left, following subject',
  'pan-right': 'smooth pan right, following subject',
  'rotate-clockwise': 'smooth rotate clockwise around subject',
  'rotate-counter-clockwise': 'smooth rotate counter-clockwise around subject',
  static: 'static camera, no movement',
  'tilt-down': 'smooth tilt down, revealing scene',
  'tilt-up': 'smooth tilt up, revealing scene',
  'truck-left': 'smooth truck left, maintaining distance',
  'truck-right': 'smooth truck right, maintaining distance',
  'zoom-in': 'smooth zoom in, focusing on subject',
  'zoom-out': 'smooth zoom out, revealing context',
};

export default function CameraMovementPromptBar({
  preset,
  customPrompt,
  onPresetChange,
  onCustomPromptChange,
}: CameraMovementPromptBarProps) {
  const effectivePrompt =
    preset === 'custom' ? customPrompt : PRESET_PROMPTS[preset];

  return (
    <Card label="Camera" icon={HiVideoCamera} bodyClassName="p-4">
      <div className="space-y-3">
        <FormDropdown
          name="camera-preset"
          label="Movement"
          value={preset}
          onChange={(e) =>
            onPresetChange(e.target.value as CameraMovementPreset)
          }
          variant={ButtonVariant.SECONDARY}
          dropdownDirection="up"
          isNoneEnabled={false}
          isFullWidth={true}
          options={CAMERA_PRESETS.map((p) => ({
            key: p.key,
            label: p.label,
          }))}
        />

        {preset === 'custom' && (
          <FormInput
            name="custom-camera-prompt"
            value={customPrompt}
            onChange={(e) => onCustomPromptChange(e.target.value)}
            placeholder="e.g., slow dolly forward with pan left"
            type="text"
          />
        )}

        {effectivePrompt && preset !== 'custom' && (
          <p className="text-xs text-foreground/60 truncate">
            {effectivePrompt}
          </p>
        )}
      </div>
    </Card>
  );
}
