import { randomUUID } from 'node:crypto';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { type PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  fromPrismaCredentialPlatform,
  PostCategory,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

export interface PublishInput {
  personaId: string;
  organizationId: string;
  userId: string;
  brandId: string;
  description: string;
  platforms?: string[];
  ingredientIds?: string[];
  category?: PostCategory;
  scheduledDate?: Date;
}

export interface PublishResult {
  postIds: string[];
  totalCreated: number;
  failedCredentials: string[];
}

@Injectable()
export class PersonaPublisherService {
  private readonly constructorName: string = String(this.constructor.name);

  private readStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : [];
  }

  constructor(
    private readonly loggerService: LoggerService,
    private readonly personasService: PersonasService,
    private readonly credentialsService: CredentialsService,
    private readonly postsService: PostsService,
  ) {}

  async publishToAll(input: PublishInput): Promise<PublishResult> {
    const caller = CallerUtil.getCallerName();
    const persona = await this.getPersonaOrFail(
      input.personaId,
      input.organizationId,
    );

    const credentialIds = this.readStringArray(persona.credentials);
    const postIds: string[] = [];
    const failedCredentials: string[] = [];

    const groupId = randomUUID();
    const platformFilter =
      input.platforms && input.platforms.length > 0
        ? new Set(input.platforms.map((platform) => platform.toLowerCase()))
        : null;

    for (const credentialId of credentialIds) {
      try {
        const credential = await this.credentialsService.findOne({
          id: credentialId,
          organizationId: input.organizationId,
        });

        if (!credential) {
          failedCredentials.push(String(credentialId));
          continue;
        }

        // credentials.platform is Prisma SCREAMING; posts.platform is lowercase.
        const domainPlatform = fromPrismaCredentialPlatform(
          String(credential.platform ?? ''),
        );
        const credentialPlatform =
          domainPlatform ?? String(credential.platform).toLowerCase();
        if (platformFilter && !platformFilter.has(credentialPlatform)) {
          continue;
        }

        const post = await this.postsService.create({
          brandId: input.brandId,
          category: input.category ?? PostCategory.POST,
          credentialId: credentialId,
          description: input.description,
          groupId,
          ingredients: input.ingredientIds ?? [],
          label: persona.label ?? 'Persona post',
          organizationId: input.organizationId,
          personaId: input.personaId,
          platform: credentialPlatform,
          scheduledDate: input.scheduledDate ?? new Date(),
          targetExecutionState: TargetExecutionState.SCHEDULED,
          userId: input.userId,
          visibility: PostVisibility.PUBLIC,
        } as Parameters<PostsService['create']>[0]);

        postIds.push(String(post.id));
      } catch (error) {
        this.loggerService.error(
          `${this.constructorName} ${caller} - Failed to create post for credential ${String(credentialId)}`,
          error,
        );
        failedCredentials.push(String(credentialId));
      }
    }

    this.loggerService.log(
      `${this.constructorName} ${caller} - Published ${postIds.length} posts for persona ${persona.label}`,
    );

    return {
      failedCredentials,
      postIds,
      totalCreated: postIds.length,
    };
  }

  private async getPersonaOrFail(
    personaId: string,
    organizationId: string,
  ): Promise<PersonaDocument> {
    const persona = await this.personasService.findOne({
      id: personaId,
      organizationId,
    });

    if (!persona) {
      throw new NotFoundException('Persona');
    }

    return persona;
  }
}
