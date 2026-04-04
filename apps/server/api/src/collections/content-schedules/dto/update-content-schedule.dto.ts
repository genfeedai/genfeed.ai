import { CreateContentScheduleDto } from '@api/collections/content-schedules/dto/create-content-schedule.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateContentScheduleDto extends PartialType(
  CreateContentScheduleDto,
) {}
