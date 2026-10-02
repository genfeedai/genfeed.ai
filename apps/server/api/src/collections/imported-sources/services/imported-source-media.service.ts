import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ImportedSourcesService } from '@api/collections/imported-sources/services/imported-sources.service';
import { AgentImportedSourceIngestService } from '@api/services/agent-source-ingest/agent-imported-source-ingest.service';
import type {
  AgentImportedSourceIngestInput,
  AgentImportedSourceIngestScope,
} from '@api/services/agent-source-ingest/agent-source-ingest.interface';
import type { ImportedSourceMediaView } from '@genfeedai/contracts/api-types/contracts/imported-source-media.contract';
import {
  importedSourceMediaRetrySchema,
  importedSourceMediaStartSchema,
} from '@genfeedai/contracts/api-types/contracts/imported-source-media.contract';
import { BadRequestException, Injectable } from '@nestjs/common';
@Injectable()
export class ImportedSourceMediaService {
  constructor(
    private readonly sources: ImportedSourcesService,
    private readonly ingest: AgentImportedSourceIngestService,
  ) {}
  private async input(
    user: AuthenticatedUser,
    brandId: string,
    id: string,
  ): Promise<AgentImportedSourceIngestInput> {
    const source = await this.sources.get(user, brandId, id);
    return {
      sourceId: source.id,
      sourceIdentityDigest: source.identityDigest,
      sourceRecordVersion: source.recordVersion,
      title: source.snapshot.title,
      ...(source.snapshot.selectedMedia
        ? { selectedMedia: source.snapshot.selectedMedia }
        : {}),
    };
  }
  private scope(
    user: AuthenticatedUser,
    brandId: string,
  ): AgentImportedSourceIngestScope {
    if (
      typeof user.userId !== 'string' ||
      !user.userId.trim() ||
      !user.organizationId
    )
      throw new BadRequestException('Invalid imported source media scope.');
    return {
      organizationId: user.organizationId,
      brandId,
      userId: user.userId,
    };
  }
  async start(
    user: AuthenticatedUser,
    brandId: string,
    id: string,
    body: unknown,
  ): Promise<ImportedSourceMediaView> {
    const source = await this.input(user, brandId, id);
    const parsed = importedSourceMediaStartSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        code: 'SOURCE_MEDIA_REQUEST_INVALID',
        message: 'Invalid source media request.',
        paths: parsed.error.issues.map((issue) => issue.path.join('.')),
      });
    return this.ingest.start(
      { ...source, ...parsed.data },
      this.scope(user, brandId),
    );
  }
  async observe(
    user: AuthenticatedUser,
    brandId: string,
    id: string,
  ): Promise<ImportedSourceMediaView> {
    const source = await this.input(user, brandId, id);
    return this.ingest.observe(source, this.scope(user, brandId));
  }
  async retry(
    user: AuthenticatedUser,
    brandId: string,
    id: string,
    body: unknown,
  ): Promise<ImportedSourceMediaView> {
    const source = await this.input(user, brandId, id);
    const parsed = importedSourceMediaRetrySchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        code: 'SOURCE_MEDIA_REQUEST_INVALID',
        message: 'Invalid source media retry.',
        paths: parsed.error.issues.map((issue) => issue.path.join('.')),
      });
    return this.ingest.retry(
      { ...source, ...parsed.data },
      this.scope(user, brandId),
    );
  }
}
