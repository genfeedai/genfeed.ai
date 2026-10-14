import type { AccountGenerationJobData } from '@api/collections/posts/services/post-account-generation-job.types';
import { ACCOUNT_GENERATION_QUEUE } from '@genfeedai/contracts/queue';
import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Queue } from 'bullmq';

export const ACCOUNT_GENERATION_PAGE_SIZE = 10;
const LEASE_MS = 60 * 60 * 1000;
const MAX_PENDING_RUNS = 1000;
const PENDING_KEY = '{account-generation}:pending';
const CLAIM = `
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ARGV[2])
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
if redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[4]) then return -1 end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[3])
redis.call('ZADD', KEYS[2], tonumber(ARGV[2]) + tonumber(ARGV[3]), KEYS[1])
return 1`;
const RENEW = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('PEXPIRE', KEYS[1], ARGV[3])
redis.call('ZADD', KEYS[2], tonumber(ARGV[2]) + tonumber(ARGV[3]), KEYS[1])
return 1`;
const RELEASE = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[1])
redis.call('ZREM', KEYS[2], KEYS[1])
return 1`;

@Injectable()
export class PostAccountGenerationQueueService {
  constructor(
    @InjectQueue(ACCOUNT_GENERATION_QUEUE)
    private readonly queue: Queue<AccountGenerationJobData>,
  ) {}

  async claim(organizationId: string, runId: string): Promise<void> {
    const client = await this.queue.client;
    const claimed = Number(
      await client.eval(
        CLAIM,
        2,
        this.key(organizationId),
        PENDING_KEY,
        runId,
        Date.now(),
        LEASE_MS,
        MAX_PENDING_RUNS,
      ),
    );
    if (claimed !== 1)
      throw new HttpException(
        {
          code:
            claimed === 0
              ? 'account_generation_already_active'
              : 'account_generation_queue_full',
          message:
            claimed === 0
              ? 'This organization already has an account generation running. Wait for it to finish.'
              : 'Account generation is busy. Try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
  }

  async renew(organizationId: string, runId: string): Promise<void> {
    const client = await this.queue.client;
    if (
      Number(
        await client.eval(
          RENEW,
          2,
          this.key(organizationId),
          PENDING_KEY,
          runId,
          Date.now(),
          LEASE_MS,
        ),
      ) !== 1
    )
      throw new ConflictException('account_generation_lease_expired');
  }

  async enqueue(data: AccountGenerationJobData): Promise<void> {
    if (
      !Number.isSafeInteger(data.dto.count) ||
      data.dto.count < 1 ||
      !Number.isSafeInteger(data.offset) ||
      data.offset < 0 ||
      data.offset >= data.dto.count ||
      data.postIds.length < 1 ||
      data.postIds.length > ACCOUNT_GENERATION_PAGE_SIZE ||
      data.previousTexts.length > ACCOUNT_GENERATION_PAGE_SIZE
    )
      throw new ConflictException('account_generation_page_too_large');
    await this.queue.add('generate-account-page', data, {
      attempts: 1,
      jobId: `account-generation-${data.run.runId}-${data.offset}`,
      removeOnComplete: 100,
      removeOnFail: 100,
    });
  }

  async release(organizationId: string, runId: string): Promise<void> {
    const client = await this.queue.client;
    await client.eval(RELEASE, 2, this.key(organizationId), PENDING_KEY, runId);
  }

  private key(organizationId: string): string {
    return `{account-generation}:organization:${organizationId}`;
  }
}
