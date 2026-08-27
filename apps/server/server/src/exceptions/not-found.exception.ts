import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Canonical JSON:API-shaped 404. Every "not found" in the API should throw
 * this (never `@nestjs/common`'s built-in) so clients get one consistent
 * `{ title, detail, source? }` response shape.
 *
 * Two forms:
 * - `new NotFoundException('Batch', batchId)` — builds
 *   `"Batch with identifier 'batchId' not found"` and sets `source.parameter`.
 * - `new NotFoundException('Persona')` — builds `"Persona not found"`.
 * - `new NotFoundException({ message })` — uses `message` verbatim as `detail`,
 *   for the handful of cases whose 404 text is a full sentence rather than a
 *   `<Resource> not found` phrase.
 */
export class NotFoundException extends HttpException {
  constructor(resource: string, identifier?: string);
  constructor(options: { message: string });
  constructor(
    resourceOrOptions: string | { message: string },
    identifier?: string,
  ) {
    const isOptions = typeof resourceOrOptions === 'object';

    const detail = isOptions
      ? resourceOrOptions.message
      : identifier
        ? `${resourceOrOptions} with identifier '${identifier}' not found`
        : `${resourceOrOptions} not found`;

    super(
      {
        detail,
        title: 'Resource Not Found',
        ...(!isOptions &&
          identifier && {
            source: {
              parameter: identifier,
            },
          }),
      },
      HttpStatus.NOT_FOUND,
    );

    // Give `Error.message` the human-readable detail (HttpException otherwise
    // derives a generic "Http Exception" from the object body). This keeps
    // logs meaningful and lets `expect(...).toThrow('<detail>')` assertions
    // work, without adding a `message` key to the serialized response body.
    this.message = detail;
  }
}
