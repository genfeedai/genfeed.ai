import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { CredentialPlatform } from '@genfeedai/enums';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class PostingSignaturesQueryDto extends BaseQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ enum: CredentialPlatform })
  @IsOptional()
  @IsEnum(CredentialPlatform)
  platform?: CredentialPlatform;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) {
      return true;
    }
    if (value === 'false' || value === false) {
      return false;
    }
    return value;
  })
  @IsBoolean()
  isEnabled?: boolean;
}
