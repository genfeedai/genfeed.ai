import { ConnectCredentialDto } from '@api/collections/credentials/dto/create-credential.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ConnectBlueskyCredentialDto extends ConnectCredentialDto {
  @ApiProperty({
    description: 'Bluesky handle, with or without the leading @',
    example: 'alice.bsky.social',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(253)
  readonly handle!: string;

  @ApiProperty({
    description:
      'An app password created in Bluesky settings. Never the account password.',
    example: 'abcd-efgh-ijkl-mnop',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  readonly appPassword!: string;

  @ApiProperty({
    description:
      'https address of the account server. Leave empty for a Bluesky-hosted account.',
    example: 'https://pds.example.com',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(253)
  readonly serviceUrl?: string;
}
