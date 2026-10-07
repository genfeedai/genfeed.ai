import { HttpException, HttpStatus } from '@nestjs/common';

export class PersistedVideoGenerationException extends HttpException {
  public readonly persistedVideoIngredientIds: readonly string[];

  private constructor(error: unknown, ids: readonly string[]) {
    super(
      error instanceof HttpException
        ? error.getResponse()
        : {
            title: 'Internal Server Error',
            detail: 'An unexpected error occurred',
          },
      error instanceof HttpException
        ? error.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR,
      { cause: error },
    );
    if (error instanceof HttpException) this.name = error.name;
    this.persistedVideoIngredientIds = Object.freeze([...ids]);
  }

  static from(error: unknown, ids: readonly string[]): unknown {
    if (error instanceof PersistedVideoGenerationException) return error;
    if (
      !Array.isArray(ids) ||
      ids.length < 1 ||
      ids.length > 4 ||
      new Set(ids).size !== ids.length ||
      ids.some(
        (id) =>
          typeof id !== 'string' ||
          id.length < 1 ||
          id.length > 128 ||
          id.trim() !== id ||
          [...id].some((character) => {
            const code = character.charCodeAt(0);
            return code < 32 || (code >= 127 && code <= 159);
          }),
      )
    )
      return error;
    return new PersistedVideoGenerationException(error, ids);
  }
}
