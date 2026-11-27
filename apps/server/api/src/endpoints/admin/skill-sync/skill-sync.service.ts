import {
  loadFirstPartySkillDefinitions,
  resolveProductSkillsDirectory,
} from '@api/collections/skills/catalog/first-party-skill-loader';
import {
  fetchRepoArchive,
  type GitHubRepository,
  RepoArchiveError,
} from '@api/collections/skills/sync/github-repo-archive';
import { stageUpstreamSkillCatalog } from '@api/collections/skills/sync/upstream-skill-stage';
import {
  type SkillCatalogSeedResult,
  SkillCatalogSeedService,
} from '@api/seeds/skill-catalog-seed.service';
import { Traced } from '@libs/tracing/traced';
import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { SyncSkillsDto } from './dto/sync-skills.dto';

/** The public repository Genfeed's platform skills come from. */
const PLATFORM_SKILLS_REPOSITORY: GitHubRepository = {
  owner: 'genfeedai',
  repo: 'skills',
};

interface SkillSyncItem {
  outcome: keyof SkillCatalogSeedResult;
  slug: string;
}

export interface SkillSyncSummary {
  commit: string;
  committedAt: string;
  dryRun: boolean;
  /** Per skill: `inserted` and `updated` are written by a live run. */
  items: SkillSyncItem[];
  totals: SkillCatalogSeedResult;
}

@Traced()
@Injectable()
export class AdminSkillSyncService {
  constructor(private readonly skills: SkillCatalogSeedService) {}

  async syncPlatformSkills(dto: SyncSkillsDto): Promise<SkillSyncSummary> {
    const dryRun = dto.dryRun !== false;
    const applicationRoot = resolveProductSkillsDirectory();
    if (!applicationRoot) {
      throw new ServiceUnavailableException(
        'The product skill catalog is not available on this server',
      );
    }

    let archive: Awaited<ReturnType<typeof fetchRepoArchive>>;
    try {
      archive = await fetchRepoArchive(PLATFORM_SKILLS_REPOSITORY, dto.ref);
    } catch (error) {
      if (error instanceof RepoArchiveError) {
        throw new BadGatewayException(error.message);
      }
      throw error;
    }

    let staged: ReturnType<typeof stageUpstreamSkillCatalog> | undefined;
    let definitions: ReturnType<typeof loadFirstPartySkillDefinitions>;
    try {
      staged = stageUpstreamSkillCatalog(archive, applicationRoot);
      definitions = loadFirstPartySkillDefinitions(staged.directory);
    } catch (error) {
      throw new UnprocessableEntityException(
        error instanceof Error
          ? error.message
          : 'The skills repository is invalid',
      );
    } finally {
      staged?.dispose();
    }

    const items: SkillSyncItem[] = [];
    const totals = await this.skills.reconcileCatalog(definitions, {
      dryRun,
      onOutcome: (slug, outcome) => items.push({ outcome, slug }),
    });
    return {
      commit: archive.commit,
      committedAt: archive.committedAt,
      dryRun,
      items,
      totals,
    };
  }
}
