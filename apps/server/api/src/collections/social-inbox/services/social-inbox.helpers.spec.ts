import {
  normalizePlatform,
  sanitizeBody,
} from '@api/collections/social-inbox/services/social-inbox.helpers';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

describe('social inbox helpers', () => {
  it('normalizes platform names', () => {
    expect(normalizePlatform(' Instagram ')).toBe('instagram');
  });

  it('removes markup and complete script or style blocks from message bodies', () => {
    expect(
      sanitizeBody(
        '<p>Hello</p><script>alert(1)</script><style>p{color:red}</style> world',
      ),
    ).toBe('Hello world');
  });

  it('preserves text from an unclosed blocked element like the previous matcher', () => {
    expect(sanitizeBody('<script>visible fallback')).toBe('visible fallback');
  });

  it('rejects bodies that contain only removable markup', () => {
    expect(() => sanitizeBody('<script>alert(1)</script>')).toThrow(
      BadRequestException,
    );
  });

  it('bounds the stored body after sanitizing', () => {
    expect(sanitizeBody('a'.repeat(20_000))).toHaveLength(10_000);
  });
});
