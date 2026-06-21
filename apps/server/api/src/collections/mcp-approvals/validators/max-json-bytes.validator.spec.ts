import { MaxJsonBytes } from '@api/collections/mcp-approvals/validators/max-json-bytes.validator';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

class TestDto {
  @MaxJsonBytes(64)
  payload!: Record<string, unknown>;
}

describe('MaxJsonBytes', () => {
  it('passes for a payload under the byte limit', async () => {
    const dto = new TestDto();
    dto.payload = { a: 1 };

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('fails for a payload over the byte limit', async () => {
    const dto = new TestDto();
    dto.payload = { big: 'x'.repeat(200) };

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints?.maxJsonBytes).toContain('bytes');
  });

  it('fails for a non-serializable (circular) payload', async () => {
    const dto = new TestDto();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    dto.payload = circular;

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
  });
});
