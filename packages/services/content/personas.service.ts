import type { PersonaAvailabilityMode } from '@genfeedai/contracts';
import type {
  BrandCharacterListItem,
  CharacterAvailabilityInput,
  CharacterGrantInput,
  CharacterGrantItem,
  CharacterImageInspection,
  ComposeCharacterSheetPromptInput,
  ComposeCharacterSheetPromptResult,
  CreatePersonaFromSheetInput,
  GrantableOrganization,
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
  grantedByOrganizationName?: string | null;
  isGranted?: boolean;
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

function toCharacterListItems(rows: Persona[]): BrandCharacterListItem[] {
  return rows.map((row) => ({
    availabilityMode: row.availabilityMode,
    availableBrandCount: row.availableBrandCount,
    availableBrandIds: row.availableBrandIds,
    avatarIngredientId: row.avatarIngredientId,
    handle: row.handle,
    id: row.id,
    grantedByOrganizationName: row.grantedByOrganizationName,
    isGranted: row.isGranted,
    isShared: row.isShared,
    label: row.label,
    owningBrandId: row.owningBrandId,
    owningBrandName: row.owningBrandName,
  }));
}

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
    return toCharacterListItems(await this.findAll());
  }

  /**
   * Every character the active brand can use, across all server pages. The
   * Library character filter lists them all, where `listCharacters` returns
   * only the first page.
   */
  async listAllCharacters(
    options: { brandId?: string; signal?: AbortSignal } = {},
  ): Promise<BrandCharacterListItem[]> {
    return toCharacterListItems(
      await this.findAllPages(
        options.brandId ? { brandId: options.brandId } : {},
        options.signal,
      ),
    );
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

  async listGrantableOrganizations(): Promise<GrantableOrganization[]> {
    const response = await this.instance.get<{
      organizations: GrantableOrganization[];
    }>('/grantable-organizations');
    return response.data.organizations;
  }

  async listGrants(id: string): Promise<CharacterGrantItem[]> {
    const response = await this.instance.get<{ grants: CharacterGrantItem[] }>(
      `/${id}/grants`,
    );
    return response.data.grants;
  }

  async grantToOrganization(
    id: string,
    input: CharacterGrantInput,
  ): Promise<void> {
    await this.instance.post(`/${id}/grants`, input);
  }

  async revokeGrant(id: string, grantId: string): Promise<void> {
    await this.instance.delete(`/${id}/grants/${grantId}`);
  }

  async moveOwnership(id: string, brandId: string): Promise<Persona> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/${id}/owner`,
      { brandId },
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
