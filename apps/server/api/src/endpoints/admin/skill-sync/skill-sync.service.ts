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
import { SkillCatalogSeedService } from '@api/seeds/skill-catalog-seed.service';
import type {
  IRepoSyncItem,
  IRepoSyncReview,
  RepoSyncChange,
} from '@genfeedai/contracts/interfaces/admin/repo-sync.interface';
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

@Traced()
@Injectable()
export class AdminSkillSyncService {
  constructor(private readonly skills: SkillCatalogSeedService) {}

  async syncPlatformSkills(dto: SyncSkillsDto): Promise<IRepoSyncReview> {
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

    const names = new Map(definitions.map((d) => [d.slug, d.name]));
    const items: IRepoSyncItem[] = [];
    await this.skills.reconcileCatalog(definitions, {
      decisions: dto.decisions,
      dryRun,
      onOutcome: (slug, _outcome, detail) =>
        items.push({
          after: detail.after.split('\n'),
          before: detail.before?.split('\n'),
          change: detail.change,
          decision: detail.decision,
          key: slug,
          label: names.get(slug) ?? slug,
          path: `${slug}/SKILL.md`,
        }),
    });

    const totals: Record<RepoSyncChange, number> = {
      conflict: 0,
      edited: 0,
      new: 0,
      unchanged: 0,
      updated: 0,
    };
    for (const item of items) totals[item.change] += 1;

    return {
      commit: archive.commit,
      committedAt: archive.committedAt,
      dryRun,
      items,
      repository: `${PLATFORM_SKILLS_REPOSITORY.owner}/${PLATFORM_SKILLS_REPOSITORY.repo}`,
      totals,
    };
  }
}
