import { UpsertHarnessProfileDto } from '@api/collections/harness-profiles/dto/upsert-harness-profile.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateHarnessProfileDto extends PartialType(
  UpsertHarnessProfileDto,
) {}
