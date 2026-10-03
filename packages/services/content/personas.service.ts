import type { PersonaAvailabilityMode } from '@genfeedai/contracts';
import type {
  BrandCharacterListItem,
  CharacterAvailabilityInput,
  CharacterImageInspection,
  ComposeCharacterSheetPromptInput,
  ComposeCharacterSheetPromptResult,
  CreatePersonaFromSheetInput,
} from '@genfeedai/contracts/interfaces';
import type { IServiceSerializer } from '@genfeedai/contracts/interfaces/utils/error.interface';
import { BaseService } from '@services/core/base.service';
import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export class Persona {
  availabilityMode?: PersonaAvailabilityMode;
  availableBrandCount?: number;
  availableBrandIds?: string[];
  avatarIngredientId?: string | null;
  handle?: string | null;
  id!: string;
  isShared?: boolean;
  label!: string;
  owningBrandId?: string | null;
  owningBrandName?: string | null;

  constructor(partial: Partial<Persona>) {
    Object.assign(this, partial);
  }
}

const personaSerializer: IServiceSerializer<Persona> = {
  serialize: (data) => data,
};

export class PersonasService extends BaseService<
  Persona,
  Partial<Persona>,
  Partial<Persona>
> {
  constructor(token: string) {
    super('/personas', token, Persona, personaSerializer);
  }

  public static getInstance(token: string): PersonasService {
    return BaseService.getDataServiceInstance(PersonasService, token);
  }

  async listCharacters(): Promise<BrandCharacterListItem[]> {
    const rows = await this.findAll();
    return rows.map((row) => ({
      availabilityMode: row.availabilityMode,
      availableBrandCount: row.availableBrandCount,
      availableBrandIds: row.availableBrandIds,
      avatarIngredientId: row.avatarIngredientId,
      handle: row.handle,
      id: row.id,
      isShared: row.isShared,
      label: row.label,
      owningBrandId: row.owningBrandId,
      owningBrandName: row.owningBrandName,
    }));
  }

  async updateAvailability(
    id: string,
    input: CharacterAvailabilityInput,
  ): Promise<Persona> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/${id}/availability`,
      input,
    );
    return deserializeResource<Persona>(response.data);
  }

  async inspectImage(assetId: string): Promise<CharacterImageInspection> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/inspect-image',
      { assetId },
    );
    return deserializeResource<CharacterImageInspection>(response.data);
  }

  async composeSheetPrompt(
    input: ComposeCharacterSheetPromptInput,
  ): Promise<ComposeCharacterSheetPromptResult> {
    const response = await this.instance.post<{ prompt: string }>(
      '/sheet-prompt',
      input,
    );
    return { prompt: response.data.prompt };
  }

  async createFromSheet(input: CreatePersonaFromSheetInput): Promise<Persona> {
    const response = await this.instance.post<{ data: Persona }>(
      '/from-sheet',
      input,
    );
    return new Persona(response.data.data);
  }
}
