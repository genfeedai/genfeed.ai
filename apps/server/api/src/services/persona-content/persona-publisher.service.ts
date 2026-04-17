import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { CredentialPlatform, PostCategory, PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable, NotFoundException } from '@nestjs/common';

export interface PublishInput {
  personaId: Types.ObjectId;
  organization: Types.ObjectId;
  user: Types.ObjectId;
  brand: Types.ObjectId;
  description: string;
  platforms?: string[];
  ingredientIds?: Types.ObjectId[];
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
      input.organization,
    );

    const credentialIds = persona.credentials ?? [];
    const postIds: string[] = [];
    const failedCredentials: string[] = [];

    const groupId = new Types.ObjectId().toHexString();
    const platformFilter =
      input.platforms && input.platforms.length > 0
        ? new Set(input.platforms.map((platform) => platform.toLowerCase()))
        : null;

    for (const credentialId of credentialIds) {
      try {
        const credential = await this.credentialsService.findOne({
          _id: credentialId,
          isDeleted: false,
          organization: input.organization,
        });

        if (!credential) {
          failedCredentials.push(String(credentialId));
          continue;
        }

        const credentialPlatform = String(credential.platform).toLowerCase();
        if (platformFilter && !platformFilter.has(credentialPlatform)) {
          continue;
        }

        const post = await this.postsService.create({
          brand: input.brand,
          category: input.category ?? PostCategory.POST,
          credential: credentialId,
          description: input.description,
          groupId,
          ingredients: input.ingredientIds ?? [],
          organization: input.organization,
          persona: input.personaId,
          platform: credential.platform as CredentialPlatform,
          scheduledDate: input.scheduledDate ?? new Date(),
          status: input.scheduledDate
            ? PostStatus.SCHEDULED
            : PostStatus.PENDING,
          user: input.user,
        } as unknown);

        postIds.push(String(post._id));
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
    personaId: Types.ObjectId,
    organization: Types.ObjectId,
  ): Promise<PersonaDocument> {
    const persona = await this.personasService.findOne({
      _id: personaId,
      isDeleted: false,
      organization,
    });

    if (!persona) {
      throw new NotFoundException('Persona not found');
    }

    return persona;
  }
}
