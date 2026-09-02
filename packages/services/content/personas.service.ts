import type {
  BrandCharacterListItem,
  ComposeCharacterSheetPromptInput,
  ComposeCharacterSheetPromptResult,
  CreatePersonaFromSheetInput,
} from '@genfeedai/contracts/interfaces';
import type { IServiceSerializer } from '@genfeedai/contracts/interfaces/utils/error.interface';
import { BaseService } from '@services/core/base.service';

export class Persona {
  avatarIngredientId?: string | null;
  handle?: string | null;
  id!: string;
  label!: string;

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
      avatarIngredientId: row.avatarIngredientId,
      handle: row.handle,
      id: row.id,
      label: row.label,
    }));
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
