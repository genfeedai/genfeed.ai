import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import type { UseFormReturn } from 'react-hook-form';
import { type Mock, vi } from 'vitest';

type FieldReader = (field?: string) => unknown;

/**
 * A prompt-bar form whose reads and writes are spies. Hooks and components
 * only call `getValues`, `setValue` and `watch`, so the rest of the
 * react-hook-form surface stays empty.
 */
export type PromptFormMock = UseFormReturn<PromptTextareaSchema> & {
  getValues: Mock<FieldReader>;
  setValue: Mock;
  watch: Mock<FieldReader>;
};

export function createPromptFormMock({
  getValues = () => undefined,
  watch = () => undefined,
}: {
  getValues?: FieldReader;
  watch?: FieldReader;
} = {}): PromptFormMock {
  const form = {
    control: {},
    formState: { isValid: true },
    getValues: vi.fn(getValues),
    setValue: vi.fn(),
    watch: vi.fn(watch),
  };

  return form as unknown as PromptFormMock;
}
