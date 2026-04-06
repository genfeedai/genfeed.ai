import { Ingredient as BaseIngredient } from '@genfeedai/client/models';
import {
  IngredientCategory,
  IngredientFormat,
  IngredientStatus,
} from '@genfeedai/enums';
import type {
  IAsset,
  IBrand,
  IIngredient,
  IMetadata,
  IPrompt,
  ITag,
} from '@genfeedai/interfaces';
import { User } from '@models/auth/user.model';
import { Metadata } from '@models/content/metadata.model';
import { Prompt } from '@models/content/prompt.model';
import { Asset } from '@models/ingredients/asset.model';
import { Brand } from '@models/organization/brand.model';
import { EnvironmentService } from '@services/core/environment.service';
import { IngredientEndpoints } from '@utils/media/ingredients.util';
import { resolveIngredientReferenceUrl } from '@utils/media/reference.util';

export class Ingredient extends BaseIngredient {
  private _ingredientUrl: string = '';

  public isPlaying: boolean = false;
  public isFavorite: boolean = false;
  public isVoteAnimating: boolean = false;

  constructor(partial: Partial<IIngredient>) {
    super(partial);

    this.isPlaying = false;
    this.isFavorite = partial?.isFavorite || false;
    this.isVoteAnimating = false;

    if (partial?.brand && typeof partial.brand === 'object') {
      this.brand = new Brand(partial.brand);
    }

    if (typeof partial?.user === 'string') {
      this.user = partial.user;
    } else if (partial?.user && typeof partial.user === 'object') {
      this.user = new User(partial.user);
    }

    if (typeof partial?.metadata === 'string') {
      this.metadata = partial.metadata;
    } else if (partial?.metadata && typeof partial.metadata === 'object') {
      this.metadata = new Metadata(partial.metadata);
    }

    if (partial?.references && partial.references.length > 0) {
      if (typeof partial.references[0] === 'string') {
        this.references = partial.references as string[];
      } else {
        const references = partial.references as IAsset[];
        this.references = references.map((r: IAsset) =>
          typeof r === 'string' ? r : new Asset(r),
        );
      }
    } else {
      this.references = [];
    }

    if (typeof partial?.prompt === 'string') {
      this.prompt = partial.prompt as unknown as Prompt;
    } else if (partial?.prompt && typeof partial.prompt === 'object') {
      this.prompt = new Prompt(partial.prompt);
    }

    if (typeof partial?.script === 'string') {
      this.script = partial.script;
    } else if (partial?.script && typeof partial.script === 'object') {
      this.script = new Ingredient(partial.script) as unknown as IIngredient;
    }

    if (typeof partial?.parent === 'string') {
      this.parent = partial.parent;
    } else if (partial?.parent) {
      this.parent = new Ingredient(partial.parent) as unknown as IIngredient;
    }

    if (partial?.sources && partial.sources.length > 0) {
      if (typeof partial.sources[0] === 'string') {
        this.sources = partial.sources as string[];
      } else {
        const sources = partial.sources as IIngredient[];
        this.sources = sources.map((s: IIngredient) =>
          typeof s === 'string' ? s : new Ingredient(s),
        ) as unknown as IIngredient[];
      }
    } else {
      this.sources = [];
    }
    this.tags = partial?.tags || [];
  }

  private get metadataObj(): IMetadata | undefined {
    return this.metadata as IMetadata | undefined;
  }

  public get metadataLabel(): string {
    return this.metadataObj?.label ?? this.id.slice(0, 8);
  }

  public get metadataDescription(): string {
    return this.metadataObj?.description ?? '';
  }

  public get metadataWidth(): number {
    return this.metadataObj?.width ?? 1080;
  }

  public get metadataHeight(): number {
    return this.metadataObj?.height ?? 1920;
  }

  public get metadataExtension(): string {
    return this.metadataObj?.extension ?? '';
  }

  public get metadataDuration(): number {
    return this.metadataObj?.duration ?? 8;
  }

  public get metadataSize(): number {
    return this.metadataObj?.size ?? 0;
  }

  public get metadataModel(): string {
    return this.metadataObj?.model ?? '';
  }

  public get metadataModelLabel(): string {
    return this.metadataObj?.modelLabel ?? this.metadataObj?.model ?? '';
  }

  public get metadataStyle(): string {
    return this.metadataObj?.style ?? '';
  }

  public get metadataTags(): ITag[] {
    return this.metadataObj?.tags ?? [];
  }

  public get primaryReference(): IAsset | string | undefined {
    if (!Array.isArray(this.references) || this.references.length === 0) {
      return undefined;
    }

    return this.references[0] as IAsset | string | undefined;
  }

  public resolveReferenceUrl(
    reference: IAsset | string | undefined,
  ): string | null {
    if (!reference) {
      return null;
    }

    return resolveIngredientReferenceUrl(reference);
  }

  public get primaryReferenceUrl(): string | undefined {
    return resolveIngredientReferenceUrl(this.references) ?? undefined;
  }

  public get aspectRatio(): string {
    const width = this.metadataWidth;
    const height = this.metadataHeight;

    if (width === height) {
      return 'aspect-square';
    }
    return width > height ? 'aspect-[16/9]' : 'aspect-[9/16]';
  }

  public get brandLogoUrl(): string {
    const logo = (this.brand as IBrand)?.logo as IAsset | undefined;
    if (logo) {
      return `${EnvironmentService.ingredientsEndpoint}/logos/${logo}`;
    }
    return `${EnvironmentService.assetsEndpoint}/placeholders/square.jpg`;
  }

  public get promptText(): string {
    if (typeof this.prompt === 'string') {
      return this.prompt;
    }
    const promptObj = this.prompt as IPrompt | undefined;
    return promptObj?.enhanced ?? promptObj?.original ?? '';
  }

  public get ingredientFormat(): IngredientFormat {
    const width = this.metadataWidth;
    const height = this.metadataHeight;

    if (width > height) {
      return IngredientFormat.LANDSCAPE;
    }
    return width < height ? IngredientFormat.PORTRAIT : IngredientFormat.SQUARE;
  }

  public get ingredientUrl(): string {
    if (this._ingredientUrl !== '') {
      return this._ingredientUrl;
    }

    const assetsEndpoint = EnvironmentService.assetsEndpoint;
    const isAudioCategory =
      this.category === IngredientCategory.VOICE ||
      this.category === IngredientCategory.MUSIC;

    if (
      this.status === IngredientStatus.PROCESSING ||
      this.status === IngredientStatus.FAILED
    ) {
      const placeholderFormat = isAudioCategory
        ? 'square'
        : this.ingredientFormat;
      this._ingredientUrl = `${assetsEndpoint}/placeholders/${placeholderFormat}.jpg`;
      return this._ingredientUrl;
    }

    const ingredientCategory = this.category
      .toUpperCase()
      .replace('-', '_') as keyof typeof IngredientCategory;

    const endpoint = IngredientEndpoints.getEndpoint(ingredientCategory);
    this._ingredientUrl = `${EnvironmentService.ingredientsEndpoint}/${endpoint}/${this.id}`;
    return this._ingredientUrl;
  }

  public get thumbnailUrl(): string | undefined {
    const assetsEndpoint = EnvironmentService.assetsEndpoint;

    switch (this.category) {
      case IngredientCategory.VIDEO:
        return `${assetsEndpoint}/placeholders/${this.ingredientFormat}.jpg`;
      case IngredientCategory.MUSIC:
        return `${assetsEndpoint}/placeholders/square.jpg`;
      default:
        return undefined;
    }
  }
}
