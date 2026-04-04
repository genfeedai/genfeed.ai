import { CreateCredentialDto } from '@api/collections/credentials/dto/create-credential.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateCredentialDto extends PartialType(CreateCredentialDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the credential is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
