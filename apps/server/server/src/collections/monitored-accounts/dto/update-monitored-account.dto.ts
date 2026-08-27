import { CreateMonitoredAccountDto } from '@server/collections/monitored-accounts/dto/create-monitored-account.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateMonitoredAccountDto extends PartialType(
  CreateMonitoredAccountDto,
) {}
