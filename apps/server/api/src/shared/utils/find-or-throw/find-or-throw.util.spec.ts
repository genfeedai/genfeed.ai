import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import {
  findOrThrow,
  findUniqueOrThrow,
} from '@api/shared/utils/find-or-throw/find-or-throw.util';
import { HttpStatus } from '@nestjs/common';

describe('findOrThrow', () => {
  const record = { id: 'batch_1', isDeleted: false };

  it('returns the record when found', async () => {
    const delegate = { findFirst: vi.fn().mockResolvedValue(record) };

    const result = await findOrThrow(
      delegate,
      { where: { id: 'batch_1', isDeleted: false } },
      'Batch',
      'batch_1',
    );

    expect(result).toBe(record);
    expect(delegate.findFirst).toHaveBeenCalledWith({
      where: { id: 'batch_1', isDeleted: false },
    });
  });

  it('throws the canonical JSON:API NotFoundException with identifier', async () => {
    const delegate = { findFirst: vi.fn().mockResolvedValue(null) };

    const error = await findOrThrow(delegate, {}, 'Batch', 'batch_1').catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(NotFoundException);
    const response = (error as NotFoundException).getResponse() as Record<
      string,
      unknown
    >;
    expect((error as NotFoundException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(response.title).toBe('Resource Not Found');
    expect(response.detail).toBe("Batch with identifier 'batch_1' not found");
    expect(response.source).toEqual({ parameter: 'batch_1' });
  });

  it('throws without identifier detail when none is given', async () => {
    const delegate = { findFirst: vi.fn().mockResolvedValue(null) };

    const error = await findOrThrow(delegate, {}, 'Persona').catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(NotFoundException);
    const response = (error as NotFoundException).getResponse() as Record<
      string,
      unknown
    >;
    expect(response.detail).toBe('Persona not found');
    expect(response.source).toBeUndefined();
  });
});

describe('findUniqueOrThrow', () => {
  it('returns the record when found', async () => {
    const record = { id: 'user_1' };
    const delegate = { findUnique: vi.fn().mockResolvedValue(record) };

    await expect(
      findUniqueOrThrow(delegate, { where: { id: 'user_1' } }, 'User'),
    ).resolves.toBe(record);
  });

  it('throws the canonical NotFoundException when missing', async () => {
    const delegate = { findUnique: vi.fn().mockResolvedValue(null) };

    await expect(
      findUniqueOrThrow(delegate, { where: { id: 'nope' } }, 'User', 'nope'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
