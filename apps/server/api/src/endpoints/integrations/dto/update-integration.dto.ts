import { CreateIntegrationDto } from '@api/endpoints/integrations/dto/create-integration.dto';
import { IntegrationStatus } from '@genfeedai/enums';
import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export class UpdateIntegrationDto extends PartialType(CreateIntegrationDto) {
  @IsOptional()
  @IsEnum(IntegrationStatus)
  status?: IntegrationStatus;
}
