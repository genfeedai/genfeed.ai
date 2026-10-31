import { describe, expect, it } from 'vitest';
import { dropUnhandledJsonApiObjectRejection } from './drop-json-api-object-rejection';

describe('dropUnhandledJsonApiObjectRejection', () => {
  it('drops a raw JSON:API object unhandled rejection', () => {
    expect(
      dropUnhandledJsonApiObjectRejection(
        {
          exception: {
            values: [
              {
                type: 'UnhandledRejection',
                value: 'Non-Error promise rejection captured with keys: errors',
              },
            ],
          },
        },
        {
          originalException: {
            errors: [{ detail: 'Unsorted shelf is temporarily unavailable' }],
          },
        },
      ),
    ).toBeNull();
  });

  it('drops Non-Error events keyed by errors even without the original object', () => {
    expect(
      dropUnhandledJsonApiObjectRejection(
        {
          exception: {
            values: [
              {
                type: 'Error',
                value: 'Non-Error exception captured with keys: errors, meta',
              },
            ],
          },
        },
        {},
      ),
    ).toBeNull();
  });

  it('keeps a normalized ServiceOperationError as the canonical issue', () => {
    const event = {
      exception: {
        values: [
          {
            type: 'ServiceOperationError',
            value: 'Ingredient query failed',
          },
        ],
      },
    };
    const error = Object.assign(new Error('Ingredient query failed'), {
      name: 'ServiceOperationError',
    });

    expect(
      dropUnhandledJsonApiObjectRejection(event, { originalException: error }),
    ).toBe(event);
  });

  it('keeps unrelated unhandled rejections', () => {
    const event = {
      exception: {
        values: [
          {
            type: 'UnhandledRejection',
            value: 'Non-Error promise rejection captured with keys: foo',
          },
        ],
      },
    };

    expect(
      dropUnhandledJsonApiObjectRejection(event, {
        originalException: { foo: 'bar' },
      }),
    ).toBe(event);
  });
});
