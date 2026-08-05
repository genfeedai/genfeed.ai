import { ConnectCredentialDto } from '@api/collections/credentials/dto/create-credential.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ConnectMastodonCredentialDto extends ConnectCredentialDto {
  @ApiProperty({
    description: 'Public Mastodon instance URL or hostname',
    example: 'mastodon.social',
  })
  @IsString()
  @MinLength(3)
  readonly instanceUrl!: string;
}
