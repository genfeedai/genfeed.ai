import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { registerDecorator, type ValidationOptions } from 'class-validator';

const REPLICATE_DESTINATION_PATTERN = /^(?:[\w-]+\/[\w.-]+(?::[\w-]+)?)$/;
const REPLICATE_VERSION_ID_PATTERN = /^[a-f0-9]{25,}$/i;

export function IsModelKeyOrTraining(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'IsModelKeyOrTraining',
      options: validationOptions,
      propertyName,
      target: object.constructor,
      validator: {
        defaultMessage() {
          return 'model must be a known ModelKey, a Replicate destination (owner/model[:version]) or a Replicate version id';
        },
        validate(value: unknown) {
          if (value == null || value === '') {
            return true;
          }
          if (typeof value !== 'string') {
            return false;
          }

          const known = (Object.values(MODEL_KEYS) as string[]).includes(value);
          const isTrainer = value.startsWith('replicate/fast-flux-trainer');
          // Accept Replicate destinations like "owner/model[:version]". Model
          // names may contain periods (e.g. "google/veo-3.1").
          const looksLikeReplicateDestination =
            REPLICATE_DESTINATION_PATTERN.test(value);
          // Accept Replicate version ids (typically long hex strings)
          const looksLikeReplicateVersionId =
            REPLICATE_VERSION_ID_PATTERN.test(value);

          return (
            known ||
            isTrainer ||
            looksLikeReplicateDestination ||
            looksLikeReplicateVersionId
          );
        },
      },
    });
  };
}
