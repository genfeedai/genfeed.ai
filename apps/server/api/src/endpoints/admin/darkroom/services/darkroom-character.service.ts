import { type PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable, NotFoundException } from '@nestjs/common';

/**
 * Owns darkroom persona (character) reads/writes and the single shared
 * persona-by-slug lookup that the other darkroom collaborators rely on.
 */
@Injectable()
export class DarkroomCharacterService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly personasService: PersonasService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Resolve a darkroom character persona by slug, or null when absent.
   * Single canonical lookup replacing the previously duplicated query blocks.
   */
  findPersonaBySlug(
    slug: string,
    organizationId: string,
  ): Promise<PersonaDocument | null> {
    return this.personasService.findOne({
      isDarkroomCharacter: true,
      isDeleted: false,
      organization: organizationId,
      slug,
    });
  }

  /**
   * Resolve a darkroom character persona by slug or throw NotFoundException.
   */
  async requirePersonaBySlug(
    slug: string,
    organizationId: string,
    notFoundMessage?: string,
  ): Promise<PersonaDocument> {
    const persona = await this.findPersonaBySlug(slug, organizationId);

    if (!persona) {
      throw new NotFoundException(
        notFoundMessage ?? `Character "${slug}" not found`,
      );
    }

    return persona;
  }

  /**
   * Get all darkroom characters (personas with isDarkroomCharacter: true)
   */
  getCharacters(organizationId: string): Promise<PersonaDocument[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { organizationId });

    return this.personasService.findAllByOrganization(organizationId, {
      isDarkroomCharacter: true,
    });
  }

  /**
   * Get a single darkroom character by slug
   */
  getCharacterBySlug(
    slug: string,
    organizationId: string,
  ): Promise<PersonaDocument> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { organizationId, slug });

    return this.requirePersonaBySlug(
      slug,
      organizationId,
      `Character with slug "${slug}" not found`,
    );
  }

  /**
   * Create a new darkroom character
   */
  createCharacter(
    data: Partial<PersonaDocument> & {
      user: string;
      organization: string;
      brand: string;
    },
  ): Promise<PersonaDocument> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { slug: data.slug });

    return this.personasService.create({
      ...data,
      isDarkroomCharacter: true,
    } as Parameters<PersonasService['create']>[0]);
  }

  /**
   * Update a darkroom character
   */
  updateCharacter(
    id: string,
    data: Partial<PersonaDocument>,
  ): Promise<PersonaDocument> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { id });

    return this.personasService.patch(
      id,
      data as Parameters<PersonasService['patch']>[1],
    );
  }
}
