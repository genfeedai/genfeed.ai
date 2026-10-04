import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import type {
  BatchInterpolationDto,
  InterpolationPairDto,
} from '@api/collections/videos/dto/batch-interpolation.dto';

export type InterpolationJobResult = {
  id: string;
  pairIndex: number;
  status: string;
};

export type CreatedPairRecords = {
  ingredientId?: string;
  promptId?: string;
};

export type InterpolationContext = {
  apiKey?: string;
  brand: NonNullable<Awaited<ReturnType<BrandsService['findOne']>>>;
  cameraPrompt: string;
  dto: BatchInterpolationDto;
  duration: number;
  groupId: string;
  height: number;
  model: NonNullable<Awaited<ReturnType<ModelsService['findOne']>>>;
  pairs: InterpolationPairDto[];
  personaIdByAssetId: ReadonlyMap<string, string>;
  user: User;
  width: number;
};
