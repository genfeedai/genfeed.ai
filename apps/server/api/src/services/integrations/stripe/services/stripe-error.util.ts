type StripeLikeError = {
  code?: string;
  name?: string;
  raw?: { code?: string };
  type?: string;
};

function asStripeLikeError(error: unknown): StripeLikeError | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  return error as StripeLikeError;
}

export function getStripeErrorCode(error: unknown): string | undefined {
  const candidate = asStripeLikeError(error);
  return candidate?.code ?? candidate?.raw?.code;
}

export function isStripeResourceMissingError(error: unknown): boolean {
  return getStripeErrorCode(error) === 'resource_missing';
}

export function isStripeSignatureVerificationError(error: unknown): boolean {
  const candidate = asStripeLikeError(error);
  return (
    candidate?.type === 'StripeSignatureVerificationError' ||
    candidate?.name === 'StripeSignatureVerificationError'
  );
}
