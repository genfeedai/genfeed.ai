import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { InputValidationUtil } from '@api/helpers/utils/input-validation/input-validation.util';

// Mock ObjectIdUtil
vi.mock('@api/helpers/utils/objectid/objectid.util', () => ({
  ObjectIdUtil: {
    validate: vi.fn(),
  },
}));

import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';

const expectValidationDetail = (fn: () => unknown, detail: string) => {
  try {
    fn();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ValidationException);
    const response = (error as ValidationException).getResponse() as {
      detail?: string;
    };
    expect(response.detail).toBe(detail);
    return;
  }
  throw new Error('Expected ValidationException');
};

const expectValidationDetailContains = (
  fn: () => unknown,
  detailFragment: string,
) => {
  try {
    fn();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ValidationException);
    const response = (error as ValidationException).getResponse() as {
      detail?: string;
    };
    expect(response.detail).toContain(detailFragment);
    return;
  }
  throw new Error('Expected ValidationException');
};

describe('InputValidationUtil', () => {
  describe('validateString', () => {
    it('should validate and return trimmed string', () => {
      const result = InputValidationUtil.validateString(
        '  test string  ',
        'testField',
        { sanitize: false },
      );
      expect(result).toBe('test string');
    });

    it('should throw error for required field when null', () => {
      expectValidationDetail(
        () => InputValidationUtil.validateString(null, 'testField'),
        'testField is required',
      );
    });

    it('should return empty string for optional field when null', () => {
      const result = InputValidationUtil.validateString(null, 'testField', {
        required: false,
      });
      expect(result).toBe('');
    });

    it('should throw error for non-string value', () => {
      expectValidationDetail(
        () => InputValidationUtil.validateString(123, 'testField'),
        'testField must be a string',
      );
    });

    it('should throw error for empty string when not allowed', () => {
      expectValidationDetail(
        () => InputValidationUtil.validateString('   ', 'testField'),
        'testField cannot be empty',
      );
    });

    it('should allow empty string when configured', () => {
      const result = InputValidationUtil.validateString('   ', 'testField', {
        allowEmpty: true,
        sanitize: false,
      });
      expect(result).toBe('');
    });

    it('should throw error for string below minLength', () => {
      expectValidationDetail(
        () =>
          InputValidationUtil.validateString('ab', 'testField', {
            minLength: 3,
          }),
        'testField must be at least 3 characters long',
      );
    });

    it('should throw error for string above maxLength', () => {
      expectValidationDetail(
        () =>
          InputValidationUtil.validateString('abcdefgh', 'testField', {
            maxLength: 5,
          }),
        'testField must be no more than 5 characters long',
      );
    });

    it('should validate pattern matching', () => {
      const result = InputValidationUtil.validateString(
        'test123',
        'testField',
        {
          pattern: /^[a-z0-9]+$/,
          sanitize: false,
        },
      );
      expect(result).toBe('test123');
    });

    it('should throw error for pattern mismatch', () => {
      expectValidationDetail(
        () =>
          InputValidationUtil.validateString('test@#$', 'testField', {
            pattern: /^[a-z0-9]+$/,
          }),
        'testField format is invalid',
      );
    });

    it('should detect and reject XSS script tags', () => {
      expectValidationDetail(
        () =>
          InputValidationUtil.validateString(
            '<script>alert("xss")</script>',
            'testField',
          ),
        'testField contains potentially dangerous content',
      );
    });

    it('should detect and reject javascript: protocol', () => {
      expectValidationDetail(
        () =>
          InputValidationUtil.validateString(
            'javascript:alert(1)',
            'testField',
          ),
        'testField contains potentially dangerous content',
      );
    });

    it('should detect and reject SQL injection patterns', () => {
      expectValidationDetail(
        () =>
          InputValidationUtil.validateString(
            'SELECT * FROM users WHERE id = 1 OR 1=1',
            'testField',
          ),
        'testField contains potentially malicious SQL patterns',
      );
    });

    it('should detect multiple NoSQL injection patterns', () => {
      expectValidationDetail(
        () =>
          InputValidationUtil.validateString(
            '{ $where: "this.a == this.b", $regex: ".*", $ne: null }',
            'testField',
          ),
        'testField contains potentially malicious NoSQL patterns',
      );
    });
  });

  describe('validateNumber', () => {
    it('should validate and return number', () => {
      const result = InputValidationUtil.validateNumber(42, 'testField');
      expect(result).toBe(42);
    });

    it('should convert string to number', () => {
      const result = InputValidationUtil.validateNumber('42', 'testField');
      expect(result).toBe(42);
    });

    it('should throw error for required field when null', () => {
      expectValidationDetail(
        () => InputValidationUtil.validateNumber(null, 'testField'),
        'testField is required',
      );
    });

    it('should return 0 for optional field when null', () => {
      const result = InputValidationUtil.validateNumber(null, 'testField', {
        required: false,
      });
      expect(result).toBe(0);
    });

    it('should throw error for NaN', () => {
      expectValidationDetail(
        () => InputValidationUtil.validateNumber('abc', 'testField'),
        'testField must be a valid number',
      );
    });

    it('should throw error for non-finite number', () => {
      expectValidationDetail(
        () => InputValidationUtil.validateNumber(Infinity, 'testField'),
        'testField must be a valid number',
      );
    });

    it('should validate minimum value', () => {
      expectValidationDetail(
        () => InputValidationUtil.validateNumber(5, 'testField', { min: 10 }),
        'testField must be at least 10',
      );
    });

    it('should validate maximum value', () => {
      expectValidationDetail(
        () => InputValidationUtil.validateNumber(15, 'testField', { max: 10 }),
        'testField must be no more than 10',
      );
    });

    it('should validate integer requirement', () => {
      expectValidationDetail(
        () =>
          InputValidationUtil.validateNumber(3.14, 'testField', {
            integer: true,
          }),
        'testField must be an integer',
      );
    });

    it('should accept integer when required', () => {
      const result = InputValidationUtil.validateNumber(42, 'testField', {
        integer: true,
      });
      expect(result).toBe(42);
    });
  });

  describe('validateBoolean', () => {
    it('should return boolean value', () => {
      expect(InputValidationUtil.validateBoolean(true, 'testField')).toBe(true);
      expect(InputValidationUtil.validateBoolean(false, 'testField')).toBe(
        false,
      );
    });

    it('should convert string "true" to boolean', () => {
      expect(InputValidationUtil.validateBoolean('true', 'testField')).toBe(
        true,
      );
      expect(InputValidationUtil.validateBoolean('TRUE', 'testField')).toBe(
        true,
      );
    });

    it('should convert string "false" to boolean', () => {
      expect(InputValidationUtil.validateBoolean('false', 'testField')).toBe(
        false,
      );
      expect(InputValidationUtil.validateBoolean('FALSE', 'testField')).toBe(
        false,
      );
    });

    it('should convert "1" and "0" to boolean', () => {
      expect(InputValidationUtil.validateBoolean('1', 'testField')).toBe(true);
      expect(InputValidationUtil.validateBoolean('0', 'testField')).toBe(false);
    });

    it('should convert "yes" and "no" to boolean', () => {
      expect(InputValidationUtil.validateBoolean('yes', 'testField')).toBe(
        true,
      );
      expect(InputValidationUtil.validateBoolean('no', 'testField')).toBe(
        false,
      );
    });

    it('should convert number to boolean', () => {
      expect(InputValidationUtil.validateBoolean(1, 'testField')).toBe(true);
      expect(InputValidationUtil.validateBoolean(0, 'testField')).toBe(false);
    });

    it('should throw error for required field when null', () => {
      expectValidationDetail(
        () => InputValidationUtil.validateBoolean(null, 'testField'),
        'testField is required',
      );
    });

    it('should return false for optional field when null', () => {
      const result = InputValidationUtil.validateBoolean(null, 'testField', {
        required: false,
      });
      expect(result).toBe(false);
    });

    it('should throw error for invalid boolean string', () => {
      expectValidationDetail(
        () => InputValidationUtil.validateBoolean('invalid', 'testField'),
        'testField must be a boolean value',
      );
    });
  });

  describe('validateArray', () => {
    const itemValidator = (item: unknown) => {
      if (typeof item !== 'string') {
        throw new ValidationException('Item must be string');
      }
      return item;
    };

    it('should validate and return array', () => {
      const result = InputValidationUtil.validateArray(
        ['a', 'b', 'c'],
        'testField',
        itemValidator,
      );
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('should throw error for required field when null', () => {
      expectValidationDetail(
        () =>
          InputValidationUtil.validateArray(null, 'testField', itemValidator),
        'testField is required',
      );
    });

    it('should return empty array for optional field when null', () => {
      const result = InputValidationUtil.validateArray(
        null,
        'testField',
        itemValidator,
        { required: false },
      );
      expect(result).toEqual([]);
    });

    it('should throw error for non-array value', () => {
      expectValidationDetail(
        () =>
          InputValidationUtil.validateArray(
            'not-array',
            'testField',
            itemValidator,
          ),
        'testField must be an array',
      );
    });

    it('should validate minimum length', () => {
      expectValidationDetail(
        () =>
          InputValidationUtil.validateArray(['a'], 'testField', itemValidator, {
            minLength: 2,
          }),
        'testField must contain at least 2 items',
      );
    });

    it('should validate maximum length', () => {
      expectValidationDetail(
        () =>
          InputValidationUtil.validateArray(
            ['a', 'b', 'c'],
            'testField',
            itemValidator,
            { maxLength: 2 },
          ),
        'testField must contain no more than 2 items',
      );
    });

    it('should throw error with item index for invalid items', () => {
      const numberValidator = (item: unknown) => {
        if (typeof item !== 'number') {
          throw new ValidationException('Must be number');
        }
        return item;
      };

      expectValidationDetailContains(
        () =>
          InputValidationUtil.validateArray(
            [1, 2, 'invalid', 4],
            'testField',
            numberValidator,
          ),
        'testField[2]',
      );
    });
  });

  describe('validateEmail', () => {
    it('should validate and return lowercase email', () => {
      const result = InputValidationUtil.validateEmail(
        'Test@Example.COM',
        'emailField',
      );
      expect(result).toBe('test@example.com');
    });

    it('should validate correct email format', () => {
      expect(
        InputValidationUtil.validateEmail('user@domain.com', 'emailField'),
      ).toBe('user@domain.com');
      expect(
        InputValidationUtil.validateEmail(
          'user.name@domain.co.uk',
          'emailField',
        ),
      ).toBe('user.name@domain.co.uk');
    });

    it('should throw error for invalid email format', () => {
      expectValidationDetail(
        () => InputValidationUtil.validateEmail('invalid-email', 'emailField'),
        'emailField format is invalid',
      );
    });

    it('should throw error for email without domain', () => {
      expectValidationDetail(
        () => InputValidationUtil.validateEmail('user@', 'emailField'),
        'emailField format is invalid',
      );
    });
  });

  describe('validateUrl', () => {
    it('should validate and return valid URL', () => {
      const result = InputValidationUtil.validateUrl(
        'https://example.com',
        'urlField',
        false,
      );
      expect(result).toBe('https:&#x2F;&#x2F;example.com');
    });

    it('should accept http and https protocols', () => {
      expect(
        InputValidationUtil.validateUrl(
          'http://example.com',
          'urlField',
          false,
        ),
      ).toBe('http:&#x2F;&#x2F;example.com');
      expect(
        InputValidationUtil.validateUrl(
          'https://example.com',
          'urlField',
          false,
        ),
      ).toBe('https:&#x2F;&#x2F;example.com');
    });

    it('should throw error for invalid URL', () => {
      expectValidationDetail(
        () => InputValidationUtil.validateUrl('not-a-url', 'urlField'),
        'urlField must be a valid URL',
      );
    });

    it('should throw error for non-http protocols', () => {
      expectValidationDetail(
        () => InputValidationUtil.validateUrl('ftp://example.com', 'urlField'),
        'urlField must be a valid URL',
      );
    });
  });

  describe('validateObjectId', () => {
    beforeEach(() => {
      vi.mocked(ObjectIdUtil.validate).mockClear();
    });

    it('should validate ObjectId string', () => {
      vi.mocked(ObjectIdUtil.validate).mockImplementation(() => true);

      const result = InputValidationUtil.validateObjectId(
        '507f1f77bcf86cd799439011',
        'idField',
      );

      expect(result).toBe('507f1f77bcf86cd799439011');
      expect(ObjectIdUtil.validate).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        'idField',
      );
    });

    it('should throw error for non-string value', () => {
      expectValidationDetail(
        () => InputValidationUtil.validateObjectId(123, 'idField'),
        'idField is required and must be a string',
      );
    });

    it('should throw error for null value', () => {
      expectValidationDetail(
        () => InputValidationUtil.validateObjectId(null, 'idField'),
        'idField is required and must be a string',
      );
    });
  });

  describe('security - XSS prevention', () => {
    it('should reject common XSS patterns', () => {
      const xssPatterns = [
        '<script>alert(1)</script>',
        'javascript:void(0)',
        '<iframe src="evil.com"></iframe>',
        '<object data="evil.swf"></object>',
        '<embed src="evil.swf">',
        'onload=alert(1)',
        'onerror=alert(1)',
        'onclick=alert(1)',
      ];

      xssPatterns.forEach((pattern) => {
        expectValidationDetail(
          () => InputValidationUtil.validateString(pattern, 'testField'),
          'testField contains potentially dangerous content',
        );
      });
    });
  });

  describe('security - SQL injection prevention', () => {
    it('should reject SQL injection patterns', () => {
      const sqlPatterns = [
        "1' OR '1'='1",
        'SELECT * FROM users',
        'DROP TABLE users',
        'INSERT INTO users VALUES',
        'UPDATE users SET',
        'DELETE FROM users',
        '1 UNION SELECT',
        'EXEC xp_cmdshell',
      ];

      sqlPatterns.forEach((pattern) => {
        expectValidationDetail(
          () => InputValidationUtil.validateString(pattern, 'testField'),
          'testField contains potentially malicious SQL patterns',
        );
      });
    });
  });

  describe('security - NoSQL injection prevention', () => {
    it('should reject NoSQL injection when multiple operators present', () => {
      const noSqlPattern =
        '{ "$where": "this.a == this.b", "$ne": null, "$or": [] }';

      expectValidationDetail(
        () => InputValidationUtil.validateString(noSqlPattern, 'testField'),
        'testField contains potentially malicious NoSQL patterns',
      );
    });
  });
});
