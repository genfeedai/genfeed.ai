import { PostGroupsQueryDto } from '@api/collections/post-groups/dto/post-groups-query.dto';
import {
  CredentialPlatform,
  PostCategory,
  ReleaseStatus,
  ReleaseTargetSource,
  TargetExecutionState,
} from '@genfeedai/enums';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const CAMPAIGN_ID = '4d3c2b1a-5e6f-4708-9a0b-1c2d3e4f5a6b';
const CREDENTIAL_ID = '7f1c9ad2-6a5b-4c3d-8e2f-0b1a2c3d4e5f';
const OTHER_CREDENTIAL_ID = '2b8e4f61-9c07-4a11-93d5-6e7f8a9b0c1d';

describe('PostGroupsQueryDto', () => {
  it('accepts paginated Publish list filters without a calendar window', async () => {
    const query = plainToInstance(PostGroupsQueryDto, {
      contentType: PostCategory.POST,
      limit: '24',
      page: '2',
      publicationState: 'posted',
      search: 'launch',
      sort: 'createdAt: -1',
    });

    await expect(validate(query)).resolves.toEqual([]);
    expect(query.contentType).toEqual([PostCategory.POST]);
    expect(query.limit).toBe(24);
    expect(query.page).toBe(2);
  });

  it('accepts a bounded ISO window and normalizes one status to an array', async () => {
    const query = plainToInstance(PostGroupsQueryDto, {
      endDate: '2026-07-27T00:00:00.000Z',
      startDate: '2026-07-20T00:00:00.000Z',
      status: ReleaseStatus.SCHEDULED,
    });

    await expect(validate(query)).resolves.toEqual([]);
    expect(query.status).toEqual([ReleaseStatus.SCHEDULED]);
  });

  it('preserves repeated valid status filters', async () => {
    const query = plainToInstance(PostGroupsQueryDto, {
      endDate: '2026-07-27T00:00:00.000Z',
      startDate: '2026-07-20T00:00:00.000Z',
      status: [ReleaseStatus.SCHEDULED, ReleaseStatus.FAILED],
    });

    await expect(validate(query)).resolves.toEqual([]);
    expect(query.status).toEqual([
      ReleaseStatus.SCHEDULED,
      ReleaseStatus.FAILED,
    ]);
  });

  it('accepts a campaign filter that is an entity id', async () => {
    const query = plainToInstance(PostGroupsQueryDto, {
      campaignId: CAMPAIGN_ID,
    });

    await expect(validate(query)).resolves.toEqual([]);
    expect(query.campaignId).toBe(CAMPAIGN_ID);
  });

  it.each([
    {
      endDate: undefined,
      name: 'a missing end date',
      startDate: '2026-07-20T00:00:00.000Z',
    },
    {
      endDate: '2026-07-19T00:00:00.000Z',
      name: 'an inverted range',
      startDate: '2026-07-20T00:00:00.000Z',
    },
    {
      endDate: '2027-07-22T00:00:00.000Z',
      name: 'a range longer than 366 days',
      startDate: '2026-07-20T00:00:00.000Z',
    },
  ])('rejects $name', async ({ endDate, startDate }) => {
    const query = plainToInstance(PostGroupsQueryDto, {
      endDate,
      startDate,
    });

    await expect(validate(query)).resolves.not.toEqual([]);
  });

  it.each([
    {
      name: 'an unsupported list sort',
      value: {
        sort: 'status: -1',
      },
    },
    {
      name: 'an unknown content type',
      value: {
        contentType: 'newsletter',
      },
    },
    {
      name: 'a malformed start date',
      value: {
        endDate: '2026-07-27T00:00:00.000Z',
        startDate: 'not-a-date',
      },
    },
    {
      name: 'an unknown release status',
      value: {
        endDate: '2026-07-27T00:00:00.000Z',
        startDate: '2026-07-20T00:00:00.000Z',
        status: 'unknown',
      },
    },
    {
      name: 'an unknown platform',
      value: {
        endDate: '2026-07-27T00:00:00.000Z',
        platform: 'myspace',
        startDate: '2026-07-20T00:00:00.000Z',
      },
    },
    {
      name: 'an unknown target execution state',
      value: {
        endDate: '2026-07-27T00:00:00.000Z',
        executionState: 'exploded',
        startDate: '2026-07-20T00:00:00.000Z',
      },
    },
    {
      name: 'a campaign filter that is not an entity id',
      value: {
        campaignId: 'not-an-id',
        endDate: '2026-07-27T00:00:00.000Z',
        startDate: '2026-07-20T00:00:00.000Z',
      },
    },
    {
      name: 'a credential filter that is not an entity id',
      value: {
        credentialId: 'not-an-id',
        endDate: '2026-07-27T00:00:00.000Z',
        startDate: '2026-07-20T00:00:00.000Z',
      },
    },
    {
      name: 'an unknown target source',
      value: {
        endDate: '2026-07-27T00:00:00.000Z',
        source: 'telepathy',
        startDate: '2026-07-20T00:00:00.000Z',
      },
    },
  ])('rejects $name', async ({ value }) => {
    const query = plainToInstance(PostGroupsQueryDto, value);

    await expect(validate(query)).resolves.not.toEqual([]);
  });

  it('normalizes single-valued target filters to arrays', async () => {
    const query = plainToInstance(PostGroupsQueryDto, {
      credentialId: CREDENTIAL_ID,
      endDate: '2026-07-27T00:00:00.000Z',
      executionState: TargetExecutionState.FAILED,
      platform: CredentialPlatform.INSTAGRAM,
      source: ReleaseTargetSource.WORKFLOW,
      startDate: '2026-07-20T00:00:00.000Z',
    });

    await expect(validate(query)).resolves.toEqual([]);
    expect(query.platform).toEqual([CredentialPlatform.INSTAGRAM]);
    expect(query.credentialId).toEqual([CREDENTIAL_ID]);
    expect(query.executionState).toEqual([TargetExecutionState.FAILED]);
    expect(query.source).toEqual([ReleaseTargetSource.WORKFLOW]);
  });

  it('preserves repeated target filter keys', async () => {
    const query = plainToInstance(PostGroupsQueryDto, {
      credentialId: [CREDENTIAL_ID, OTHER_CREDENTIAL_ID],
      endDate: '2026-07-27T00:00:00.000Z',
      executionState: [
        TargetExecutionState.FAILED,
        TargetExecutionState.PAUSED,
      ],
      platform: [CredentialPlatform.INSTAGRAM, CredentialPlatform.TIKTOK],
      source: [ReleaseTargetSource.AGENT, ReleaseTargetSource.WORKFLOW],
      startDate: '2026-07-20T00:00:00.000Z',
    });

    await expect(validate(query)).resolves.toEqual([]);
    expect(query.source).toEqual([
      ReleaseTargetSource.AGENT,
      ReleaseTargetSource.WORKFLOW,
    ]);
    expect(query.platform).toEqual([
      CredentialPlatform.INSTAGRAM,
      CredentialPlatform.TIKTOK,
    ]);
    expect(query.credentialId).toEqual([CREDENTIAL_ID, OTHER_CREDENTIAL_ID]);
    expect(query.executionState).toEqual([
      TargetExecutionState.FAILED,
      TargetExecutionState.PAUSED,
    ]);
  });

  it('drops empty filter values instead of validating a blank string', async () => {
    const query = plainToInstance(PostGroupsQueryDto, {
      credentialId: '',
      endDate: '2026-07-27T00:00:00.000Z',
      executionState: '',
      platform: '',
      source: '',
      startDate: '2026-07-20T00:00:00.000Z',
      status: '',
    });

    await expect(validate(query)).resolves.toEqual([]);
    expect(query.platform).toBeUndefined();
    expect(query.credentialId).toBeUndefined();
    expect(query.executionState).toBeUndefined();
    expect(query.source).toBeUndefined();
    expect(query.status).toBeUndefined();
  });
});
