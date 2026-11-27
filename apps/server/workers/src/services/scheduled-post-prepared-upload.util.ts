import { createHash, randomUUID } from 'node:crypto';
import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PreparedProviderUpload } from '@api/index';
import { PostPreparedUploadStatus } from '@genfeedai/contracts';
import type { PrismaService } from '@libs/prisma/prisma.service';
import type { PreparedPostDelivery } from '@workers/services/scheduled-post-delivery.types';
import { occurrenceScope } from '@workers/services/scheduled-post-provider-receipt.util';

type UploadClient = Pick<PrismaService, 'postPreparedUpload'>;

/** The prepare run that holds an upload row; only it may complete or fail it. */
export type PreparedUploadLease = { id: string; leaseToken: string };

/**
 * A prepare run that has not finished within this window is taken to be dead,
 * and the next sweep may prepare the occurrence again. A container upload with
 * a Reel's processing takes a few minutes at most.
 */
export const PREPARED_UPLOAD_LEASE_MS = 10 * 60_000;

/** JSON with sorted object keys, so equal settings give an equal digest. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * What the delivery sends besides the occurrence's content: the channel and
 * its account, the resolved target settings (placement, cover, music, AI
 * label) and the audience. A change to any of them makes a prepared upload
 * unusable even though the occurrence key is the same.
 */
export function preparedUploadInputDigest(
  prepared: PreparedPostDelivery,
): string {
  const { context } = prepared;
  return createHash('sha256')
    .update(
      stableJson([
        prepared.platform,
        String(context.credential.id ?? ''),
        context.credential.externalId ?? null,
        context.settings,
        context.visibility ?? null,
        context.post.isShareToFeedSelected ?? null,
      ]),
    )
    .digest('hex');
}

function isUniqueConflict(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'P2002'
  );
}

/**
 * Hold the occurrence's upload row for one prepare run, or null when there is
 * nothing to do: an upload for these inputs is ready, taken or failed, or
 * another run holds a live lease. A row whose inputs changed, or whose run
 * died, is taken over; every takeover compares the token it observed, so two
 * runs never both hold it.
 */
export async function reservePreparedUpload(
  prisma: UploadClient,
  post: PostEntity,
  inputDigest: string,
  now: Date = new Date(),
): Promise<PreparedUploadLease | null> {
  const scope = occurrenceScope(post);
  const row = await prisma.postPreparedUpload.findFirst({
    where: { ...scope, isDeleted: false },
    select: {
      id: true,
      inputDigest: true,
      leaseRenewedAt: true,
      leaseToken: true,
      status: true,
    },
  });
  const leaseToken = randomUUID();
  if (!row) {
    try {
      const created = await prisma.postPreparedUpload.create({
        data: {
          ...scope,
          inputDigest,
          leaseRenewedAt: now,
          leaseToken,
          status: PostPreparedUploadStatus.PREPARING,
        },
        select: { id: true },
      });
      return { id: created.id, leaseToken };
    } catch (error: unknown) {
      if (isUniqueConflict(error)) return null;
      throw error;
    }
  }
  const isLeaseExpired =
    row.status === PostPreparedUploadStatus.PREPARING &&
    now.getTime() - row.leaseRenewedAt.getTime() >= PREPARED_UPLOAD_LEASE_MS;
  const hasStaleInputs =
    (row.status === PostPreparedUploadStatus.READY ||
      row.status === PostPreparedUploadStatus.FAILED) &&
    row.inputDigest !== inputDigest;
  if (!isLeaseExpired && !hasStaleInputs) return null;
  const taken = await prisma.postPreparedUpload.updateMany({
    where: {
      id: row.id,
      organizationId: scope.organizationId,
      postId: scope.postId,
      leaseToken: row.leaseToken,
      status: row.status,
      isDeleted: false,
    },
    data: {
      consumedByAttempt: null,
      expiresAt: null,
      inputDigest,
      leaseRenewedAt: now,
      leaseToken,
      providerUploadId: null,
      status: PostPreparedUploadStatus.PREPARING,
    },
  });
  return taken.count === 1 ? { id: row.id, leaseToken } : null;
}

/** Settle the row this run holds; false once another run took it over. */
async function settlePreparedUpload(
  prisma: UploadClient,
  post: PostEntity,
  lease: PreparedUploadLease,
  data: {
    expiresAt?: Date;
    providerUploadId?: string;
    status: PostPreparedUploadStatus;
  },
): Promise<boolean> {
  const { organizationId, postId } = occurrenceScope(post);
  const settled = await prisma.postPreparedUpload.updateMany({
    where: {
      id: lease.id,
      organizationId,
      postId,
      leaseToken: lease.leaseToken,
      status: PostPreparedUploadStatus.PREPARING,
      isDeleted: false,
    },
    data,
  });
  return settled.count === 1;
}

export function completePreparedUpload(
  prisma: UploadClient,
  post: PostEntity,
  lease: PreparedUploadLease,
  upload: PreparedProviderUpload,
): Promise<boolean> {
  return settlePreparedUpload(prisma, post, lease, {
    expiresAt: upload.expiresAt,
    providerUploadId: upload.providerUploadId,
    status: PostPreparedUploadStatus.READY,
  });
}

/** The delivery uploads at the due time as before. */
export function failPreparedUpload(
  prisma: UploadClient,
  post: PostEntity,
  lease: PreparedUploadLease,
): Promise<boolean> {
  return settlePreparedUpload(prisma, post, lease, {
    status: PostPreparedUploadStatus.FAILED,
  });
}

/**
 * Take the ready upload of this occurrence for the provider attempt
 * `attemptToken`, or null when there is none for these inputs or it expired.
 * The take moves the row out of READY in one conditional write, so an upload
 * is handed to one attempt only and never published twice.
 */
export async function takePreparedUpload(
  prisma: UploadClient,
  post: PostEntity,
  inputDigest: string,
  attemptToken: string,
  now: Date = new Date(),
): Promise<PreparedProviderUpload | null> {
  const scope = occurrenceScope(post);
  const row = await prisma.postPreparedUpload.findFirst({
    where: {
      ...scope,
      expiresAt: { gt: now },
      inputDigest,
      status: PostPreparedUploadStatus.READY,
      isDeleted: false,
    },
    select: {
      expiresAt: true,
      id: true,
      leaseToken: true,
      providerUploadId: true,
    },
  });
  if (!row?.providerUploadId || !row.expiresAt) return null;
  const taken = await prisma.postPreparedUpload.updateMany({
    where: {
      id: row.id,
      organizationId: scope.organizationId,
      postId: scope.postId,
      inputDigest,
      leaseToken: row.leaseToken,
      status: PostPreparedUploadStatus.READY,
      isDeleted: false,
    },
    data: {
      consumedByAttempt: attemptToken,
      status: PostPreparedUploadStatus.CONSUMED,
    },
  });
  return taken.count === 1
    ? { expiresAt: row.expiresAt, providerUploadId: row.providerUploadId }
    : null;
}
