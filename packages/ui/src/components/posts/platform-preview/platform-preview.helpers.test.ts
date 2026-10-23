import { TargetValidationState } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import { resolvePlatformPreviewTarget } from './PlatformPreview.data';
import {
  extractFirstUrl,
  formatHandle,
  getAuthorName,
  getPreviewStatus,
} from './platform-preview.helpers';

describe('platform preview presentation helpers', () => {
  it.each([
    [undefined, undefined],
    ['', undefined],
    ['  ', undefined],
    [' creator ', '@creator'],
    [' @creator ', '@creator'],
  ])(
    'formats a known handle without inventing a fallback: %s',
    (input, output) => {
      expect(formatHandle(input)).toBe(output);
    },
  );
  it('uses the actual author name and preserves the existing empty-name fallback', () => {
    const target = { platform: 'twitter', caption: '' };
    expect(getAuthorName({ ...target, author: { name: '  Example  ' } })).toBe(
      'Example',
    );
    expect(getAuthorName({ ...target, author: { name: '  ' } })).toBe(
      'Your Account',
    );
    expect(getAuthorName(target)).toBe('Your Account');
  });
  it('extracts the first HTTP URL without treating mentions as URLs', () => {
    expect(extractFirstUrl('@creator #tag')).toBeNull();
    expect(
      extractFirstUrl('Read https://example.com/a\nthen http://example.org'),
    ).toBe('https://example.com/a');
  });
  it('keeps blocking diagnostics ahead of warnings and valid status', () => {
    const target = resolvePlatformPreviewTarget({
      platform: 'twitter',
      caption: 'A post',
    });
    const base = {
      ...target,
      validation: {
        ...target.validation,
        validationState: TargetValidationState.VALID,
        errors: [],
        warnings: [],
      },
    };
    expect(getPreviewStatus(base).messageKey).toBe('valid');
    expect(
      getPreviewStatus({
        ...base,
        validation: {
          ...base.validation,
          validationState: TargetValidationState.WARNING,
        },
      }).messageKey,
    ).toBe('warnings');
    expect(
      getPreviewStatus({
        ...base,
        validation: {
          ...base.validation,
          validationState: TargetValidationState.INVALID,
        },
      }).messageKey,
    ).toBe('blocked');
    expect(
      getPreviewStatus({
        ...base,
        validation: {
          ...base.validation,
          warnings: [
            {
              code: 'fixture-warning',
              message: 'Warning',
              severity: 'warning',
            },
          ],
          errors: [
            { code: 'fixture-error', message: 'Error', severity: 'error' },
          ],
        },
      }).messageKey,
    ).toBe('blocked');
  });
});
