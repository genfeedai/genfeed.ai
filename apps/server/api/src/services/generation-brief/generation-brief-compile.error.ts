export type GenerationBriefCompileErrorCode =
  | 'invalid_brief'
  | 'unsupported_required_signal';

export class GenerationBriefCompileError extends Error {
  readonly code: GenerationBriefCompileErrorCode;

  constructor(message: string, code: GenerationBriefCompileErrorCode) {
    super(message);
    this.code = code;
    this.name = 'GenerationBriefCompileError';
  }
}
