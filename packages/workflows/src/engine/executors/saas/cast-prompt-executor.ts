import {
  type CASTInput,
  type CameraMovement,
  generateCASTPrompt,
} from '../../services/cast-prompt.service';
import type { ExecutableNode } from '../../types';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '../base-executor';

const CAMERA_MOVEMENTS: CameraMovement[] = [
  'dolly',
  'tracking',
  'static',
  'crane',
  'aerial',
  'handheld',
  'steadicam',
];

function readCameraMovement(value: unknown): CameraMovement {
  if (
    typeof value === 'string' &&
    CAMERA_MOVEMENTS.includes(value as CameraMovement)
  ) {
    return value as CameraMovement;
  }
  return 'static';
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export class CastPromptExecutor extends BaseExecutor {
  readonly nodeType = 'castPrompt';

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const config = input.node.config;
    const startFrame = input.inputs.get('startFrame');
    const hasStartFrameReference =
      config.hasStartFrameReference === true ||
      (typeof startFrame === 'string' && startFrame.length > 0);

    const castInput: CASTInput = {
      action: readString(config.action),
      cameraMovement: readCameraMovement(config.cameraMovement),
      colorPalette: readString(config.colorPalette),
      hasStartFrameReference,
      lighting: readString(config.lighting),
      mood: readString(config.mood),
      presetId: readString(config.presetId),
      subject: readString(config.subject),
    };

    const result = generateCASTPrompt(castInput);

    return {
      data: {
        output: result.prompt,
        preset: result.preset,
        prompt: result.prompt,
        text: result.prompt,
      },
      metadata: {
        cameraMovement: result.metadata.cameraMovement,
        presetId: result.preset.id,
        wordCount: result.metadata.wordCount,
      },
    };
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const presetId = readString(node.config.presetId);

    if (!presetId) {
      errors.push('Preset is required');
    }

    return { errors, valid: errors.length === 0 };
  }

  estimateCost(_node: ExecutableNode): number {
    return 0;
  }
}
