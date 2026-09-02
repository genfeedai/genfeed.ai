import { CreateMonitoredAccountDto } from '@api/collections/monitored-accounts/dto/create-monitored-account.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateMonitoredAccountDto extends PartialType(
  CreateMonitoredAccountDto,
) {}
