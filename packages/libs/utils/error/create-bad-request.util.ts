import { BadRequestException } from '@nestjs/common';

/**
 * Error factory handed to the framework-agnostic path-security guards
 * (`resolveContainedPath`, `assertSafeObjectKey`, ...), which build their errors
 * through an injected callback instead of throwing a Nest exception themselves.
 */
export const createBadRequest = (message: string): BadRequestException =>
  new BadRequestException(message);
