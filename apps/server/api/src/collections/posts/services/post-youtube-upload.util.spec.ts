import type { PostDocument } from '@api/collections/posts/post.schema';
import {
  type PostYoutubeUploadDependencies,
  queueYoutubePostUpload,
} from '@api/collections/posts/services/post-youtube-upload.util';
import { CredentialPlatform } from '@genfeedai/contracts';
import type { IYoutubeUploadData } from '@genfeedai/contracts/interfaces';

vi.mock(
  '@api/collections/outliers/services/breakout-publication-fence.util',
  () => ({ assertBreakoutPublicationDispatch: async () => undefined }),
);

function youtubePost(targetSettings?: Record<string, unknown>): PostDocument {
  return {
    brandId: 'brand-a',
    credential: { id: 'credential-a', platform: CredentialPlatform.YOUTUBE },
    description: 'A video',
    id: 'post-a',
    ingredients: [{ id: 'ingredient-a' }],
    label: 'Title',
    organizationId: 'org-a',
    tags: [],
    targetSettings,
    userId: 'user-a',
  } as unknown as PostDocument;
}

/** Runs the queueing and returns the job the Files service would receive. */
async function queuedJob(post: PostDocument): Promise<IYoutubeUploadData> {
  const jobs: IYoutubeUploadData[] = [];
  const deps = {
    fileQueueService: {
      uploadYoutube: async (job: IYoutubeUploadData) => {
        jobs.push(job);
        return { jobId: 'job-1' };
      },
    },
    logger: {
      error: () => undefined,
      log: () => undefined,
      warn: () => undefined,
    },
    patch: async () => undefined,
    prisma: {},
  } as unknown as PostYoutubeUploadDependencies;

  await queueYoutubePostUpload(deps, post);

  return jobs[0];
}

describe('queueYoutubePostUpload YouTube disclosures', () => {
  it('labels a post that never had settings as AI-generated and not for kids', async () => {
    const job = await queuedJob(youtubePost(undefined));

    expect(job.containsSyntheticMedia).toBe(true);
    expect(job.selfDeclaredMadeForKids).toBe(false);
  });

  it('sends the label the post turned off and the audience it declared', async () => {
    const job = await queuedJob(
      youtubePost({ aiGenerated: false, madeForKids: true }),
    );

    expect(job.containsSyntheticMedia).toBe(false);
    expect(job.selfDeclaredMadeForKids).toBe(true);
  });
});
