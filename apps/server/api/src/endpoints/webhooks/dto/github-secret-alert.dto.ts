import type { SecretAlert } from '@api/endpoints/webhooks/github/webhooks.github.service';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * One element of the `POST /webhooks/github/callback` body.
 *
 * GitHub Secret Scanning posts a JSON *array* of alerts, so this DTO is applied
 * per element through `ParseArrayPipe({ items: GitHubSecretAlertDto })` rather
 * than as the `@Body()` metatype — an array metatype is skipped by the global
 * pipe, which is how this endpoint went unvalidated. `token`, `type`, and `url`
 * are required because the handler dereferences all three on every alert and on
 * every error path.
 *
 * `ParseArrayPipe` leaves `whitelist` off by default, so unknown vendor keys
 * survive here without the `ALLOW_UNKNOWN_PROPERTIES` opt-out the object-bodied
 * webhook DTOs need. The signature check is unaffected either way: it runs
 * against `@RawBody()`, not the parsed body.
 *
 * @see https://docs.github.com/en/code-security/secret-scanning/secret-scanning-partner-program
 */
export class GitHubSecretAlertDto implements SecretAlert {
  @IsString()
  @ApiProperty({
    description: 'Matched token, checked against issued API keys',
  })
  token!: string;

  @IsString()
  @ApiProperty({ description: 'Secret type slug reported by GitHub' })
  type!: string;

  @IsString()
  @ApiProperty({ description: 'URL of the location the token was found at' })
  url!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Where the match was found', required: false })
  source?: string;
}
