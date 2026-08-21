interface JsonApiErrorMember {
  readonly detail?: unknown;
  readonly title?: unknown;
}

interface JsonApiErrorDocument {
  readonly errors?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getErrorDocument(error: unknown): JsonApiErrorDocument | null {
  if (!isRecord(error)) {
    return null;
  }
  if ('errors' in error) {
    return error;
  }

  const response = error.response;
  if (!isRecord(response) || !isRecord(response.data)) {
    return null;
  }
  return response.data;
}

export function getJsonApiErrorMessage(
  error: unknown,
  fallback: string,
): string {
  const document = getErrorDocument(error);
  const firstError = Array.isArray(document?.errors)
    ? document.errors.find(isRecord)
    : undefined;
  if (firstError) {
    const member: JsonApiErrorMember = firstError;
    if (typeof member.detail === 'string' && member.detail.trim()) {
      return member.detail.trim();
    }
    if (typeof member.title === 'string' && member.title.trim()) {
      return member.title.trim();
    }
  }

  return error instanceof Error && error.message ? error.message : fallback;
}
