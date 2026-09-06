import type { ExecutionContext } from '../../execution/engine';
import type { ExecutableNode } from '../../types';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '../base-executor';
import { mediaArtifactUrl } from './media-artifact-url';

export interface SpeechSegment {
  start: number;
  end: number;
  text: string;
}
export interface LocalizeSpeechResult {
  audio: { id: string; audioUrl: string; duration: number; status: string };
  transcript: { text: string; segments: SpeechSegment[] };
  translatedScript: string;
  segments: SpeechSegment[];
  duration: number;
}
export interface SpeechSegmentOverride extends SpeechSegment {
  voiceId?: string;
  language?: string;
}
export interface LocalizeSpeechOptions {
  segments?: SpeechSegmentOverride[];
  brandId: string;
  targetLanguage: string;
  voiceId: string;
  sourceLanguage?: string;
  script?: string;
  timingToleranceSeconds: number;
}
export type LocalizeSpeechResolver = (
  video: unknown,
  options: LocalizeSpeechOptions,
  context: ExecutionContext,
  node: ExecutableNode,
) => Promise<LocalizeSpeechResult>;

export class LocalizeSpeechExecutor extends BaseExecutor {
  readonly nodeType = 'localizeSpeech';
  private resolver: LocalizeSpeechResolver | null = null;
  setResolver(resolver: LocalizeSpeechResolver): void {
    this.resolver = resolver;
  }
  estimateCost(): number {
    return 5;
  }
  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const { errors } = super.validate(node);
    for (const field of ['brandId', 'targetLanguage', 'voiceId']) {
      if (typeof node.config[field] !== 'string' || !node.config[field].trim())
        errors.push(`${field} is required`);
    }
    const tolerance = node.config.timingToleranceSeconds;
    if (
      tolerance !== undefined &&
      (typeof tolerance !== 'number' ||
        !Number.isFinite(tolerance) ||
        tolerance < 0)
    )
      errors.push('Timing tolerance must be a finite non-negative number');
    return { errors, valid: errors.length === 0 };
  }
  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    if (!this.resolver)
      throw new Error('LocalizeSpeech resolver not configured');
    const config = { ...input.node.config };
    for (const field of [
      'brandId',
      'targetLanguage',
      'voiceId',
      'sourceLanguage',
      'timingToleranceSeconds',
      'script',
      'segments',
    ]) {
      if (input.inputs.has(field)) config[field] = input.inputs.get(field);
    }
    const resolvedNode = { ...input.node, config };
    const validation = this.validate(resolvedNode);
    if (!validation.valid) throw new Error(validation.errors.join('; '));
    const videoUrl = mediaArtifactUrl(input.inputs.get('video'), 'video');
    if (!videoUrl) throw new Error('Missing required input: video');
    const script = config.script;
    if (script !== undefined && typeof script !== 'string')
      throw new Error('Script override must be text');
    const segments = config.segments;
    if (
      segments !== undefined &&
      (!Array.isArray(segments) || !segments.every(isSpeechSegmentOverride))
    )
      throw new Error(
        'Segments must contain finite ordered timestamps and text',
      );
    const result = await this.resolver(
      input.inputs.get('video'),
      {
        brandId: this.getRequiredConfig<string>(config, 'brandId'),
        targetLanguage: this.getRequiredConfig<string>(
          config,
          'targetLanguage',
        ),
        voiceId: this.getRequiredConfig<string>(config, 'voiceId'),
        sourceLanguage:
          typeof config.sourceLanguage === 'string'
            ? config.sourceLanguage
            : undefined,
        script,
        segments,
        timingToleranceSeconds: this.getOptionalConfig<number>(
          config,
          'timingToleranceSeconds',
          0.75,
        ),
      },
      input.context,
      resolvedNode,
    );
    return {
      data: result,
      metadata: {
        duration: result.duration,
        targetLanguage: config.targetLanguage,
      },
    };
  }
}

function isSpeechSegmentOverride(
  value: unknown,
): value is SpeechSegmentOverride {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const segment = value as Record<string, unknown>;
  return (
    typeof segment.start === 'number' &&
    Number.isFinite(segment.start) &&
    segment.start >= 0 &&
    typeof segment.end === 'number' &&
    Number.isFinite(segment.end) &&
    segment.end > segment.start &&
    typeof segment.text === 'string' &&
    (segment.voiceId === undefined || typeof segment.voiceId === 'string') &&
    (segment.language === undefined || typeof segment.language === 'string')
  );
}
