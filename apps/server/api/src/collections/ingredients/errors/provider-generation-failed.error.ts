/** The provider confirms that an accepted job has ended without an output. */
export class ProviderGenerationFailedError extends Error {
  constructor(
    readonly externalId: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderGenerationFailedError';
  }
}
