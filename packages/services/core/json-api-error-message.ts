interface JsonApiErrorDocument {
  readonly errors?: unknown;
}

export interface JsonApiErrorMemberView {
  readonly code?: string;
  readonly detail?: string;
  readonly status?: number;
  readonly title?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseHttpStatusCode(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && /^\d{3}$/.test(value.trim())) {
    return Number.parseInt(value, 10);
  }

  return undefined;
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

export function getJsonApiErrorMember(
  error: unknown,
): JsonApiErrorMemberView | null {
  const document = getErrorDocument(error);
  const firstError = Array.isArray(document?.errors)
    ? document.errors.find(isRecord)
    : undefined;
  if (!firstError) {
    return null;
  }

  const code =
    typeof firstError.code === 'string' || typeof firstError.code === 'number'
      ? String(firstError.code)
      : undefined;

  return {
    code,
    detail:
      typeof firstError.detail === 'string' ? firstError.detail : undefined,
    status:
      parseHttpStatusCode(firstError.status) ??
      parseHttpStatusCode(firstError.code),
    title: typeof firstError.title === 'string' ? firstError.title : undefined,
  };
}

export function getJsonApiErrorMessage(
  error: unknown,
  fallback: string,
): string {
  const member = getJsonApiErrorMember(error);
  if (member?.detail?.trim()) {
    return member.detail.trim();
  }
  if (member?.title?.trim()) {
    return member.title.trim();
  }

  return error instanceof Error && error.message ? error.message : fallback;
}
