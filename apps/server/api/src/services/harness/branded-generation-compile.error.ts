export class BrandedGenerationCompileError extends Error {
  constructor(
    public readonly code:
      | 'context_budget_exceeded'
      | 'required_context_altered',
    public readonly requiredCharacters: number,
    public readonly maxCharacters: number,
  ) {
    super(code);
    this.name = 'BrandedGenerationCompileError';
  }
}
