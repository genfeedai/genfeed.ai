import { AssetsService } from '@api/collections/assets/services/assets.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import {
  buildReferenceImageUrl,
  buildReferenceImageUrls,
} from '@api/helpers/utils/reference/reference.util';
import { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

/**
 * URLs a video provider fetches reference images and frames from. Owns the
 * lookups and the media issuer so generation preparation stays small; with
 * authorized delivery on, every URL is a grant minted from a stored key.
 */
@Injectable()
export class VideoReferenceUrlService {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly configService: ConfigService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    @Optional()
    private readonly authorizedMediaUrls?: AuthorizedMediaUrlService,
  ) {}

  resolveUrl(params: {
    grantedOwners?: ReadonlyMap<string, string>;
    organizationId: string;
    referenceId: string;
  }): Promise<string | null> {
    return buildReferenceImageUrl({ ...this.dependencies(), ...params });
  }

  resolveUrls(params: {
    grantedOwners?: ReadonlyMap<string, string>;
    organizationId: string;
    referenceIds: string[];
  }): Promise<string[]> {
    return buildReferenceImageUrls({ ...this.dependencies(), ...params });
  }

  private dependencies() {
    return {
      assetsService: this.assetsService,
      authorizedMediaUrls: this.authorizedMediaUrls,
      configService: this.configService,
      ingredientsService: this.ingredientsService,
      loggerService: this.loggerService,
    };
  }
}
