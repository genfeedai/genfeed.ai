import type { CronJobType } from '@api/collections/cron-jobs/schemas/cron-job.schema';
import { validateCronPayload } from '@api/collections/cron-jobs/utils/cron-payload-validation.util';
import {
  type ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

type CronPayloadCarrier = {
  jobType?: CronJobType;
  payload?: Record<string, unknown>;
};

@ValidatorConstraint({ async: false, name: 'cronJobPayload' })
export class CronJobPayloadValidator implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as CronPayloadCarrier;

    if (!dto.jobType) {
      return true;
    }

    const errors = validateCronPayload(dto.jobType, dto.payload);
    return errors.length === 0;
  }

  defaultMessage(args: ValidationArguments): string {
    const dto = args.object as CronPayloadCarrier;
    const errors = validateCronPayload(
      dto.jobType ?? 'newsletter_substack',
      dto.payload,
    );
    return errors[0] ?? 'Invalid cron payload for selected jobType';
  }
}
