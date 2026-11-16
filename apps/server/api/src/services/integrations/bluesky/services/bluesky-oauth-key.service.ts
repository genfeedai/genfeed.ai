import { randomUUID } from 'node:crypto';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { JoseKey } from '@atproto/oauth-client-node';
import { Traced } from '@libs/tracing/traced';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { Injectable } from '@nestjs/common';

/** Row key of the signing key the Bluesky OAuth client authenticates with. */
const BLUESKY_SIGNING_KEY_PROVIDER = 'bluesky_oauth_client';
const PRISMA_UNIQUE_VIOLATION = 'P2002';

/**
 * The signing key of the Bluesky OAuth client.
 *
 * Bluesky issues long sessions (a refresh token for up to 180 days) only to a
 * confidential client, which proves who it is with a key whose public half it
 * publishes. The key is minted on first use and kept encrypted in the database,
 * so a deployment needs no extra environment variable to run it.
 */
@Traced()
@Injectable()
export class BlueskyOAuthKeyService {
  private cached: Promise<JoseKey> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** The client key, created on the first call and the same afterwards. */
  getKey(): Promise<JoseKey> {
    this.cached ??= this.loadOrCreate().catch((error: unknown) => {
      // A failed load must not be remembered, or every connect would fail.
      this.cached = null;
      throw error;
    });
    return this.cached;
  }

  private async loadOrCreate(): Promise<JoseKey> {
    const existing = await this.prisma.platformSigningKey.findUnique({
      where: { provider: BLUESKY_SIGNING_KEY_PROVIDER },
    });
    if (existing) {
      return this.parse(existing.privateJwk);
    }

    const keyId = randomUUID();
    const generated = await JoseKey.generate(['ES256'], keyId);
    // Pin the key to signing with ES256, so the published key cannot be taken
    // for an encryption key and Bluesky picks it for the client assertion.
    const created = await JoseKey.fromJWK({
      ...generated.privateJwk,
      alg: 'ES256',
      key_ops: ['sign'],
      kid: keyId,
    });
    try {
      await this.prisma.platformSigningKey.create({
        data: {
          keyId,
          privateJwk: EncryptionUtil.encrypt(
            JSON.stringify(created.privateJwk),
          ),
          provider: BLUESKY_SIGNING_KEY_PROVIDER,
          publicJwk: JSON.parse(JSON.stringify(created.publicJwk)),
        },
      });
      return created;
    } catch (error: unknown) {
      // Another instance created it first: use theirs so every instance signs
      // with the one key the published metadata lists.
      if ((error as { code?: unknown }).code !== PRISMA_UNIQUE_VIOLATION) {
        throw error;
      }
      const winner = await this.prisma.platformSigningKey.findUniqueOrThrow({
        where: { provider: BLUESKY_SIGNING_KEY_PROVIDER },
      });
      return this.parse(winner.privateJwk);
    }
  }

  private parse(encryptedPrivateJwk: string): Promise<JoseKey> {
    return JoseKey.fromJWK(
      JSON.parse(EncryptionUtil.decrypt(encryptedPrivateJwk)) as Record<
        string,
        unknown
      >,
    );
  }
}
