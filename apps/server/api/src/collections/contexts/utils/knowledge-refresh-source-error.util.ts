import {
  type ExtractedSourceText,
  type ExtractSourceTextInput,
  extractSourceText,
} from '@api/collections/contexts/utils/extract-source-text.util';
import { DestinationGuardError } from '@libs/security/destination-guard';
import { HttpException, UnprocessableEntityException } from '@nestjs/common';

const NETWORK_CODES = [
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
] as const;

type NetworkCode = (typeof NETWORK_CODES)[number];

export class KnowledgeSourceUnavailableException extends UnprocessableEntityException {
  constructor(readonly networkCode: NetworkCode) {
    const detail =
      'The source could not be reached. Check its URL and availability, then try again.';
    super({ title: 'Knowledge source unavailable', detail });
    this.message = detail;
  }
}

function findNetworkCode(error: unknown): NetworkCode | undefined {
  const seen = new Set<object>();
  let current = error;
  let networkCode: NetworkCode | undefined;
  while (
    current &&
    typeof current === 'object' &&
    !seen.has(current) &&
    seen.size < 16
  ) {
    if (
      current instanceof HttpException ||
      current instanceof DestinationGuardError
    ) {
      return undefined;
    }
    seen.add(current);
    if ('code' in current) {
      const currentCode = current.code;
      networkCode ??= NETWORK_CODES.find((code) => code === currentCode);
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  return networkCode;
}

export async function extractKnowledgeRefreshSourceText(
  input: ExtractSourceTextInput,
): Promise<ExtractedSourceText> {
  try {
    return await extractSourceText(input);
  } catch (error) {
    const networkCode = findNetworkCode(error);
    if (networkCode) throw new KnowledgeSourceUnavailableException(networkCode);
    throw error;
  }
}
