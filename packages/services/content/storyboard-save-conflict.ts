import type { IHttpErrorPresentationContext } from '@genfeedai/contracts/interfaces/utils/http-request-options.interface';
import { getJsonApiErrorMember } from '@services/core/json-api-error-message';

export function isExpectedStoryboardSaveConflict(
  response: IHttpErrorPresentationContext,
  expectedRevision: number,
): boolean {
  if (
    response.status !== 409 ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 1
  )
    return false;
  const body = response.data;
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    !('errors' in body)
  )
    return false;
  if (!Array.isArray(body.errors) || body.errors.length !== 1) return false;
  const raw: unknown = body.errors[0];
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    !('status' in raw) ||
    raw.status !== '409' ||
    !('code' in raw) ||
    raw.code !== '409' ||
    !('title' in raw) ||
    raw.title !== 'Conflict'
  )
    return false;
  const member = getJsonApiErrorMember(body);
  if (!member?.detail) return false;
  if (
    member.detail ===
    'The storyboard changed during this save. Reload before retrying.'
  )
    return true;
  const match =
    /^Expected revision ([1-9][0-9]*); current revision is ([1-9][0-9]*). Reload before retrying\.$/.exec(
      member.detail,
    );
  if (!match) return false;
  const expected = Number(match[1]);
  const current = Number(match[2]);
  return (
    Number.isSafeInteger(expected) &&
    Number.isSafeInteger(current) &&
    expected === expectedRevision &&
    current !== expected
  );
}
