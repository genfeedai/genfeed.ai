import {
  CredentialPlatform,
  fromPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import { HttpException, HttpStatus } from '@nestjs/common';

export function toCredentialPlatform(platform: unknown): CredentialPlatform {
  const mapped = fromPrismaCredentialPlatform(
    typeof platform === 'string' ? platform : String(platform ?? ''),
  );
  if (!mapped) {
    throw new HttpException(
      {
        detail: `Unknown credential platform: ${String(platform ?? 'missing')}`,
        title: 'Unknown credential platform',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
  return mapped;
}
