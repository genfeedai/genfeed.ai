/** Provider failure that keeps only the HTTP status, never the URL or payload. */
export class SystemNotificationDeliveryError extends Error {
  constructor(
    message: string,
    readonly statusCode: number | null = null,
  ) {
    super(message);
    this.name = 'SystemNotificationDeliveryError';
  }
}

export function systemNotificationStatusCode(error: unknown): number | null {
  return error instanceof SystemNotificationDeliveryError
    ? error.statusCode
    : null;
}
