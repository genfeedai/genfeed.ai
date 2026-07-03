import { type PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

/**
 * Owns fleet persona (character) reads/writes and the single shared
 * persona-by-slug lookup that the other fleet collaborators rely on.
 */
@Injectable()
export class AdminFleetCharacterService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly personasService: PersonasService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Resolve a fleet character persona by slug, or null when absent.
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
   * Resolve a fleet character persona by slug or throw NotFoundException.
   */
  async requirePersonaBySlug(
    slug: string,
    organizationId: string,
  ): Promise<PersonaDocument> {
    const persona = await this.findPersonaBySlug(slug, organizationId);

    if (!persona) {
      throw new NotFoundException('Character', slug);
    }

    return persona;
  }

  /**
   * Get all fleet characters (personas with isDarkroomCharacter: true)
   */
  getCharacters(organizationId: string): Promise<PersonaDocument[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { organizationId });

    return this.personasService.findAllByOrganization(organizationId, {
      isDarkroomCharacter: true,
    });
  }

  /**
   * Get a single fleet character by slug
   */
  getCharacterBySlug(
    slug: string,
    organizationId: string,
  ): Promise<PersonaDocument> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { organizationId, slug });

    return this.requirePersonaBySlug(slug, organizationId);
  }

  /**
   * Create a new fleet character
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
   * Update a fleet character
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
