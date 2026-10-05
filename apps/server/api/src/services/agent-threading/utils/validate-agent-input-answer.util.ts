import type { ResolveAgentInputRequestParams } from '@genfeedai/contracts/interfaces/ai/agent-input-request.interface';
import { BadRequestException } from '@nestjs/common';

/** Validate against the persisted choice and its original brand/thread context. */
export function validateAgentInputAnswer(
  request: Record<string, unknown>,
  params: ResolveAgentInputRequestParams,
): string {
  const metadata =
    request.metadata && typeof request.metadata === 'object'
      ? (request.metadata as Record<string, unknown>)
      : {};
  if (
    typeof metadata.brandId === 'string' &&
    metadata.brandId !== params.brandId
  )
    throw new BadRequestException(
      'This choice belongs to another brand context.',
    );
  if (
    typeof metadata.contextVersion === 'number' &&
    metadata.contextVersion !== params.contextVersion
  )
    throw new BadRequestException(
      'The thread context changed. Request the choice again.',
    );

  const answer = typeof params.answer === 'string' ? params.answer.trim() : '';
  if (!answer) throw new BadRequestException('An answer is required.');
  if (request.status === 'resolved' && request.answer !== answer)
    throw new BadRequestException('This request was already answered.');
  const options = Array.isArray(request.options)
    ? (request.options as Record<string, unknown>[])
    : [];
  const optionIds = params.optionIds;
  const hasOptionIds = optionIds !== undefined;
  const isValidSelection =
    Array.isArray(optionIds) &&
    optionIds.length > 0 &&
    new Set(optionIds).size === optionIds.length &&
    optionIds.length <=
      (request.isMultiSelect === true
        ? typeof request.maxSelections === 'number'
          ? request.maxSelections
          : options.length
        : 1) &&
    optionIds.every(
      (id) =>
        typeof id === 'string' && options.some((option) => option.id === id),
    ) &&
    optionIds
      .map((id) => options.find((option) => option.id === id)?.label)
      .join(', ') === answer;
  if (hasOptionIds && !isValidSelection)
    throw new BadRequestException(
      'Choose valid options within the selection limit.',
    );
  if (
    request.allowFreeText === false &&
    !isValidSelection &&
    !options.some((option) => option.id === answer || option.label === answer)
  )
    throw new BadRequestException('Choose one of the available options.');
  return answer;
}
