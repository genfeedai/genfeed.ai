import { describe, expect, it } from 'vitest';

import { isCreditTransactionConflict } from './credit-transaction-conflict';

function adapterError(message: string, cause: Record<string, unknown>): Error {
  return Object.assign(new Error(message), {
    cause,
    name: 'DriverAdapterError',
  });
}

describe('isCreditTransactionConflict', () => {
  it.each([
    ['P2034', { code: 'P2034' }],
    [
      'top-level adapter write conflict',
      adapterError('TransactionWriteConflict', {
        kind: 'TransactionWriteConflict',
        originalCode: '40001',
      }),
    ],
    [
      'top-level adapter write conflict without SQLSTATE',
      adapterError('TransactionWriteConflict', {
        kind: 'TransactionWriteConflict',
      }),
    ],
    [
      'adapter deadlock cause',
      adapterError('DriverAdapterError', { originalCode: '40P01' }),
    ],
    [
      'raw query P2010 with SQLSTATE 40001',
      { code: 'P2010', meta: { code: '40001' } },
    ],
    [
      'raw query P2010 with adapter cause',
      {
        code: 'P2010',
        meta: {
          driverAdapterError: { cause: { originalCode: '40P01' } },
        },
      },
    ],
  ])('treats %s as retryable', (_label, error) => {
    expect(isCreditTransactionConflict(error)).toBe(true);
  });

  it.each([
    ['null', null],
    ['plain error', new Error('boom')],
    ['unique violation', { code: 'P2002' }],
    [
      'adapter write conflict message on another error name',
      Object.assign(new Error('TransactionWriteConflict'), { cause: {} }),
    ],
    [
      'adapter error with another SQLSTATE',
      adapterError('DriverAdapterError', { originalCode: '23505' }),
    ],
    ['P2010 with another SQLSTATE', { code: 'P2010', meta: { code: '23505' } }],
  ])('does not retry %s', (_label, error) => {
    expect(isCreditTransactionConflict(error)).toBe(false);
  });
});
