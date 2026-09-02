import { UpsertHarnessProfileDto } from '@api/collections/harness-profiles/dto/upsert-harness-profile.dto';
import { OmitType, PartialType } from '@nestjs/swagger';

export class UpdateHarnessProfileDto extends PartialType(
  OmitType(UpsertHarnessProfileDto, ['brandId'] as const),
) {}
