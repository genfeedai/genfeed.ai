import { canonicalizeBrandedGenerationJsonV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import type { BrandedGenerationReceiptCursorV1 } from '@api/services/branded-generation-receipts/branded-generation-receipts.types';
import { learningContractIdSchema } from '@genfeedai/contracts/api-types/contracts';
import type { BrandedGenerationReceiptV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { z } from 'zod';

const RECEIPT_CURSOR_MAX_JSON_BYTES = 1584;
const RECEIPT_CURSOR_MAX_ENCODED_CHARS = 2112;
const cursorSchema = z.strictObject({
  createdAt: z.iso.datetime().refine((value) => {
    try {
      return value.length === 24 && new Date(value).toISOString() === value;
    } catch {
      return false;
    }
  }),
  id: learningContractIdSchema,
});
export function decodeBrandedGenerationReceiptCursorV1(
  value: string | undefined,
): BrandedGenerationReceiptCursorV1 | undefined {
  let cursor: z.infer<typeof cursorSchema> | undefined;
  if (value !== undefined) {
    try {
      if (
        typeof value !== 'string' ||
        value.length < 1 ||
        value.length > RECEIPT_CURSOR_MAX_ENCODED_CHARS
      )
        throw new Error('Invalid cursor');
      if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1)
        throw new Error('Invalid cursor');
      const bytes = Buffer.from(value, 'base64url');
      if (bytes.byteLength > RECEIPT_CURSOR_MAX_JSON_BYTES)
        throw new Error('Invalid cursor');
      cursor = cursorSchema.parse(
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
      );
      if (
        Buffer.from(canonicalizeBrandedGenerationJsonV1(cursor)).toString(
          'base64url',
        ) !== value
      )
        throw new Error('Invalid cursor');
    } catch {
      throw new BadRequestException('receipt_cursor_invalid');
    }
  }
  return cursor;
}

export function encodeBrandedGenerationReceiptCursorV1(
  receipt: BrandedGenerationReceiptV1,
): string {
  const parsed = cursorSchema.safeParse({
    createdAt: receipt.createdAt,
    id: receipt.id,
  });
  if (!parsed.success)
    throw new InternalServerErrorException('receipt_integrity_failed');
  return Buffer.from(canonicalizeBrandedGenerationJsonV1(parsed.data)).toString(
    'base64url',
  );
}
