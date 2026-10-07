import { readRawString } from '@genfeedai/contracts/constants/type-guards.constant';
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

function readStringOrEmpty(value: unknown): string {
  return readRawString(value) ?? '';
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
      action: readStringOrEmpty(config.action),
      cameraMovement: readCameraMovement(config.cameraMovement),
      colorPalette: readStringOrEmpty(config.colorPalette),
      hasStartFrameReference,
      lighting: readStringOrEmpty(config.lighting),
      mood: readStringOrEmpty(config.mood),
      presetId: readStringOrEmpty(config.presetId),
      subject: readStringOrEmpty(config.subject),
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
    const presetId = readStringOrEmpty(node.config.presetId);

    if (!presetId) {
      errors.push('Preset is required');
    }

    return { errors, valid: errors.length === 0 };
  }

  estimateCost(_node: ExecutableNode): number {
    return 0;
  }
}
