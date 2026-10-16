import { HttpException, HttpStatus } from '@nestjs/common';

export const MISSING_PROVIDER_KEY_CODE = 'missing_provider_key';

/**
 * A request needs a model provider key that this deployment does not have:
 * neither the server environment variable nor an organization key is set. It
 * fails before any provider call, so nothing was dispatched or billed, and a
 * retry cannot succeed until an operator adds the key.
 */
export class MissingProviderKeyException extends HttpException {
  public readonly envVar: string;
  public readonly provider: string;

  constructor(provider: string, envVar: string) {
    const message = `Missing provider key: ${envVar}`;

    super(
      {
        code: MISSING_PROVIDER_KEY_CODE,
        detail: `${message}. Add it to the server environment and restart, or save a ${provider} key under Organization settings > Integrations.`,
        message,
        meta: { envVar, provider },
        status: HttpStatus.SERVICE_UNAVAILABLE,
        title: 'Missing provider key',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );

    this.name = 'MissingProviderKeyException';
    this.envVar = envVar;
    this.provider = provider;
  }
}
