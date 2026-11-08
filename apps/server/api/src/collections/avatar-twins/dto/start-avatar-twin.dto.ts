import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

/** Starts a twin from a recording already saved in the Library. */
export class StartAvatarTwinDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

  /** The private Library video holding the training footage. */
  @IsString()
  @MaxLength(64)
  sourceIngredientId!: string;

  /** Repeating a request with the same key returns the same enrollment. */
  @IsString()
  @Matches(IDEMPOTENCY_KEY_PATTERN)
  idempotencyKey!: string;
}
