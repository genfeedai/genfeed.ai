import { normalizeOperationError } from '@services/core/operation-error';
import { describe, expect, it } from 'vitest';
import { describeBrandDeleteFailure } from './brand-delete-failure.util';

const refusal = (status: number, message: string) =>
  normalizeOperationError('DELETE /brands/b1', {
    response: { data: { errors: [{ detail: message, status }] }, status },
    status,
  });

describe('describeBrandDeleteFailure', () => {
  it('shows the last-brand refusal without reporting it', () => {
    const failure = describeBrandDeleteFailure(
      refusal(
        409,
        "Cannot delete an organization's last brand. Create another brand first.",
      ),
    );

    expect(failure.isExpected).toBe(true);
    expect(failure.message).toContain('last brand');
  });

  it('keeps a server error reportable with the generic message', () => {
    expect(describeBrandDeleteFailure(refusal(500, 'boom'))).toEqual({
      isExpected: false,
      message: 'Failed to delete brand',
    });
  });

  it('does not expose a forbidden refusal detail', () => {
    expect(describeBrandDeleteFailure(refusal(403, 'Forbidden'))).toEqual({
      isExpected: true,
      message: 'Failed to delete brand',
    });
  });

  it('treats a non-service error as unexpected', () => {
    expect(describeBrandDeleteFailure(new Error('network down'))).toEqual({
      isExpected: false,
      message: 'Failed to delete brand',
    });
  });
});
