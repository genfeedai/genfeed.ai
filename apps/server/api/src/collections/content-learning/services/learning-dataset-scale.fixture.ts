import { randomUUID } from 'node:crypto';
import {
  buildArtifactContentDigest,
  buildArtifactVersionPinIdempotencyKey,
  projectPostArtifactMaterial,
  readArtifactRecord,
} from '@api/agent-artifacts/agent-artifact-material.util';
import type {
  createLearningDatasetPublication,
  createLearningDatasetPublicationEvidence,
  DatasetFixtureAdmission,
} from '@api/collections/content-learning/services/learning-dataset-publication.fixture';
import { LearningDatasetPublicationPins } from '@api/collections/content-learning/services/learning-dataset-publication-pins';
import { resolveLearningPublicationSourceV1 } from '@api/collections/content-learning/services/learning-publication-source.helper';
import {
  learningPublicationDependencyRefsV1,
  projectAssociation,
  projectLearningPublicationContextV1,
  projectLearningPublicationSourceV1,
} from '@api/collections/content-learning/services/learning-publication-source.projection';
import {
  learningPublicationApprovalSelect,
  learningPublicationBrandSelect,
  learningPublicationCredentialSelect,
  learningPublicationFinalizationSelect,
  learningPublicationOrganizationSelect,
  learningPublicationPinSelect,
  learningPublicationPostSelect,
} from '@api/collections/content-learning/services/learning-publication-source.types';
import { PublishApprovalContractCodec } from '@api/publish-approvals/publish-approval-contract.codec';
import { digestPublishApprovalValue } from '@api/publish-approvals/publish-approval-integrity';
import {
  assertControllerOwnedMigrationConnection,
  type ControllerOwnedMigrationRole,
} from '@api-test/helpers/controller-owned-migration-database';
import {
  Platform,
  PostCategory,
  PostFormat,
  PostVisibility,
  PublishApprovalPolicyId,
  PublishApprovalStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { Prisma, PrismaClient } from '@genfeedai/prisma';
import type { Pool } from 'pg';

type Publication = Awaited<ReturnType<typeof createLearningDatasetPublication>>;
type Evidence = Awaited<
  ReturnType<typeof createLearningDatasetPublicationEvidence>
>;
const publicationAt = new Date('2026-09-01T00:00:00.000Z');
const postSelect = {
  ...learningPublicationPostSelect,
  agentContextVersion: true,
  status: true,
  ingredients: { select: { id: true } },
} satisfies Prisma.PostSelect;
type PostRow = Prisma.PostGetPayload<{ select: typeof postSelect }>;
const savedTables = [
  ['organizations', 'organizations'],
  ['brands', 'brands'],
  ['credentials', 'credentials'],
  ['accounts', 'content_learning_accounts'],
  ['consents', 'content_learning_consents'],
  ['posts', 'posts'],
  ['approvals', 'publish_approvals'],
  ['finalizations', 'post_publish_finalizations'],
  ['scopes', 'content_learning_scope_states'],
  ['checkpoints', 'content_learning_checkpoints'],
  ['baselines', 'content_learning_baselines'],
  ['dependencies', 'content_learning_dependencys'],
] as const;
const mutableColumns = {
  organizations: ['isDeleted'],
  brands: ['isActive', 'isDeleted'],
  credentials: ['isConnected', 'isDeleted'],
  accounts: [
    'sharingConsentVersion',
    'evidenceRevision',
    'revision',
    'epoch',
    'resetAt',
    'updatedAt',
  ],
  consents: ['granted', 'revokedAt', 'isDeleted', 'updatedAt'],
  posts: [
    'description',
    'visibility',
    'targetExecutionState',
    'isDeleted',
    'publishApprovalId',
    'reviewVersionPinId',
    'updatedAt',
  ],
  approvals: [
    'status',
    'artifactVersionPinId',
    'invalidatedAt',
    'invalidationReason',
    'updatedAt',
  ],
  finalizations: ['result', 'updatedAt'],
} as const;

/** Only snapshot scale rows are constructed directly. The initial cohort uses real services. */
export class LearningDatasetScaleFixture {
  private readonly namespace = randomUUID();
  private readonly codec = new PublishApprovalContractCodec();
  private corpus: Publication[] = [];
  private ready = false;
  private failed = false;

  constructor(
    private readonly prisma: PrismaClient<'query'>,
    private readonly pool: Pool,
    private readonly role: Extract<
      ControllerOwnedMigrationRole,
      'dataset-correctness' | 'dataset-matrix' | 'dataset-profile'
    >,
  ) {}

  async initialize(publications: Publication[], evidence: Evidence) {
    if (this.ready || this.failed || this.corpus.length)
      throw new Error('Dataset cohort initialization is not repeatable');
    try {
      await assertControllerOwnedMigrationConnection(this.pool, this.role);
      for (const values of [
        publications.map((row) => row.source.postId),
        publications.map((row) => row.source.versionPinId),
        publications.map((row) => row.source.approvalId),
        publications.map((row) => row.source.finalizationId),
        evidence.checkpoints.map((row) => row.id),
      ])
        if (values.length !== 200 || new Set(values).size !== 200)
          throw new Error(
            'Dataset requires exactly 200 distinct genuine sources',
          );
      if (
        evidence.baselines.length !== 10 ||
        evidence.baselines.some(
          (row) => row.count !== 20 || row.validity !== 'valid',
        )
      )
        throw new Error(
          'Dataset requires ten real twenty-contributor baselines',
        );
      if (
        publications.some(
          (row, index) =>
            row.index !== index ||
            row.source.organizationId !== `org-${(index % 10) % 2}` ||
            row.source.brandId !== `brand-${(index % 10) % 2}` ||
            row.source.credentialId !== `credential-${index % 10}`,
        )
      )
        throw new Error('Genuine cohort has an unexpected source scope');
      if (new Set(evidence.baselines.map((row) => row.id)).size !== 10)
        throw new Error('Baseline identities must be distinct');
      this.corpus = [...publications];
      await this.assertBatch(publications, true);
      await this.savePristineCohort(publications, evidence);
      this.ready = true;
    } catch (error) {
      this.failed = true;
      throw error;
    }
  }

  private async savePristineCohort(
    publications: Publication[],
    evidence: Evidence,
  ) {
    const ids = {
      posts: publications.map((row) => row.source.postId),
      approvals: publications.map((row) => row.source.approvalId),
      finalizations: publications.map((row) => row.source.finalizationId),
      checkpoints: evidence.checkpoints.map((row) => row.id),
      baselines: evidence.baselines.map((row) => row.id),
    };
    for (const [name, table] of savedTables) {
      const saved = `dataset_fixture_saved_${name}`;
      await this.pool.query(`CREATE TABLE "${saved}" (LIKE "${table}")`);
      if (name in ids) {
        const key = name as keyof typeof ids;
        await this.pool.query(
          `INSERT INTO "${saved}" SELECT * FROM "${table}" WHERE id=ANY($1::text[])`,
          [ids[key]],
        );
      } else if (name === 'dependencies') {
        await this.pool.query(
          `INSERT INTO "${saved}" SELECT * FROM "${table}" WHERE ("derivedKind"='checkpoint' AND "derivedId"=ANY($1::text[])) OR ("derivedKind"='baseline' AND "derivedId"=ANY($2::text[]))`,
          [ids.checkpoints, ids.baselines],
        );
      } else if (name === 'organizations') {
        await this.pool.query(
          `INSERT INTO "${saved}" SELECT * FROM "${table}" WHERE id=ANY($1::text[])`,
          [['org-0', 'org-1']],
        );
      } else {
        await this.pool.query(
          `INSERT INTO "${saved}" SELECT * FROM "${table}" WHERE "organizationId"=ANY($1::text[])`,
          [['org-0', 'org-1']],
        );
      }
    }
  }

  async restore(admission: DatasetFixtureAdmission) {
    this.assertReady();
    admission.assertOpen();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const table of [
        'content_learning_dependencys',
        'content_learning_operations',
        'content_learning_dataset_entries',
        'content_learning_datasets',
        'content_learning_rewards',
        'content_learning_decisions',
        'content_learning_baselines',
        'content_learning_checkpoints',
        'content_learning_scope_states',
      ]) {
        admission.assertOpen();
        await client.query(`DELETE FROM "${table}"`);
      }
      for (const [name, table] of savedTables) {
        if (!(name in mutableColumns)) continue;
        const key = name as keyof typeof mutableColumns;
        const columns = mutableColumns[key]
          .map((column) => `"${column}"=saved."${column}"`)
          .join(',');
        const scope =
          name === 'organizations'
            ? ''
            : ' AND target."organizationId"=saved."organizationId"';
        admission.assertOpen();
        await client.query(
          `UPDATE "${table}" target SET ${columns} FROM "dataset_fixture_saved_${name}" saved WHERE target.id=saved.id${scope}`,
        );
        const mismatch = mutableColumns[key]
          .map(
            (column) => `target."${column}" IS DISTINCT FROM saved."${column}"`,
          )
          .join(' OR ');
        const compared = await client.query(
          `SELECT count(*)::int AS count FROM "dataset_fixture_saved_${name}" saved LEFT JOIN "${table}" target ON target.id=saved.id${scope} WHERE target.id IS NULL OR (${mismatch})`,
        );
        if (compared.rows[0]?.count !== 0)
          throw new Error(
            'Saved mutable fixture facts were not restored exactly',
          );
      }
      for (const [name, table] of savedTables.filter(([name]) =>
        ['scopes', 'checkpoints', 'baselines', 'dependencies'].includes(name),
      )) {
        admission.assertOpen();
        await client.query(
          `INSERT INTO "${table}" SELECT * FROM "dataset_fixture_saved_${name}"`,
        );
      }
      await client.query('COMMIT');
      await this.assertBatch(this.corpus.slice(0, 200), false);
    } catch (error) {
      this.failed = true;
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'Dataset restore and rollback failed',
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private assertReady() {
    if (!this.ready || this.failed)
      throw new Error('Dataset cohort is unavailable');
  }

  publications(size: number) {
    this.assertReady();
    if (size > this.corpus.length) throw new Error('Unvalidated scale prefix');
    return this.corpus.slice(0, size);
  }

  async grow(size: number, admission: DatasetFixtureAdmission) {
    this.assertReady();
    if (!Number.isInteger(size) || size < 200 || size > 100000)
      throw new Error('Invalid bounded dataset scale');
    try {
      for (let start = this.corpus.length; start < size; start += 1000) {
        admission.assertOpen();
        const end = Math.min(size, start + 1000);
        const rows = await this.createAuthorityBatch(start, end, admission);
        await this.assertBatch(rows, false);
        this.corpus.push(...rows);
      }
    } catch (error) {
      this.failed = true;
      throw error;
    }
  }

  private async readPosts(ids: string[]) {
    const rows: PostRow[] = [];
    for (const organizationId of ['org-0', 'org-1'])
      rows.push(
        ...(await this.prisma.post.findMany({
          where: { id: { in: ids }, organizationId, isDeleted: false },
          select: postSelect,
        })),
      );
    if (rows.length !== ids.length)
      throw new Error('Missing scoped scale posts');
    return rows;
  }

  private authorityInputs(post: PostRow, index: number) {
    const pinId = randomUUID();
    const material = {
      ...projectPostArtifactMaterial(
        readArtifactRecord({ ...post, ingredients: [] }),
      ),
      children: [],
    };
    const contentDigest = buildArtifactContentDigest(material);
    const pin = {
      id: pinId,
      organizationId: post.organizationId,
      brandId: post.brandId,
      createdByUserId: 'actor',
      recordKind: 'post',
      recordId: post.id,
      contentDigest,
      idempotencyKey: buildArtifactVersionPinIdempotencyKey(
        {
          organizationId: post.organizationId,
          brandId: post.brandId,
          kind: 'post',
          recordId: post.id,
        },
        contentDigest,
      ),
      provenance: {
        source: 'dataset-scale-fixture',
        contractVersion: 1,
        serializer: 'post',
      },
    } satisfies Prisma.ContentVersionPinCreateManyInput;
    if (!post.credentialId || post.platform !== Platform.TWITTER)
      throw new Error('Missing or incompatible scale publish target');
    const input = this.codec.parseCreateInput({
      policy: { id: PublishApprovalPolicyId.VERSION_BOUND_V1, version: 1 },
      postId: post.id,
      scheduleIntent: { kind: 'immediate' },
    });
    const destinations = this.codec.canonicalDestinations({
      ...post,
      credentialId: post.credentialId,
      platform: post.platform,
    });
    const id = randomUUID();
    const contextVersion = input.contextVersion ?? post.agentContextVersion;
    const approval = {
      id,
      organizationId: post.organizationId,
      brandId: post.brandId,
      postId: post.id,
      artifactVersionPinId: pinId,
      actorUserId: 'actor',
      contextVersion,
      destinations: this.codec.toJson(destinations),
      policy: this.codec.toJson(input.policy),
      scheduleIntent: this.codec.toJson(input.scheduleIntent),
      provenance: {
        source: 'dataset-scale-fixture',
        contractVersion: 1,
        actorUserId: 'actor',
      },
      scopeDigest: digestPublishApprovalValue({
        actorUserId: 'actor',
        artifactVersionPinId: pinId,
        brandId: post.brandId,
        contextVersion,
        destinations,
        organizationId: post.organizationId,
        policy: input.policy,
        postId: post.id,
        scheduleIntent: input.scheduleIntent,
      }),
      operationId: digestPublishApprovalValue({
        action: 'publish',
        approvalId: id,
        artifactVersionPinId: pinId,
        destinations,
      }),
      status: PublishApprovalStatus.PUBLISHED,
      executedAt: publicationAt,
      statusTransitions: this.codec.toJson([
        this.codec.transition(
          null,
          PublishApprovalStatus.PUBLISHED,
          'actor',
          'Canonical scale fixture; not service execution',
        ),
      ]),
    } satisfies Prisma.PublishApprovalCreateManyInput;
    return { post, pin, approval, index };
  }

  private async createAuthorityBatch(
    start: number,
    end: number,
    admission: DatasetFixtureAdmission,
  ) {
    const inputs = Array.from({ length: end - start }, (_, offset) => {
      const index = start + offset;
      return {
        id: `post-${this.namespace}-${index}`,
        organizationId: `org-${(index % 10) % 2}`,
        brandId: `brand-${(index % 10) % 2}`,
        credentialId: `credential-${index % 10}`,
        description: `Fixture publication ${index}`,
        userId: 'actor',
        platform: Platform.TWITTER,
        category: PostCategory.TEXT,
        format: PostFormat.STANDARD,
        visibility: PostVisibility.PUBLIC,
        timezone: 'UTC',
        targetAttachments: [],
        targetSettings: {},
      } satisfies Prisma.PostCreateManyInput;
    });
    await this.prisma.post.createMany({ data: inputs });
    admission.assertOpen();
    const authority = (await this.readPosts(inputs.map((row) => row.id))).map(
      (post) => {
        const offset = inputs.findIndex((row) => row.id === post.id);
        if (offset < 0) throw new Error('Unknown scale row index');
        return this.authorityInputs(post, start + offset);
      },
    );
    await this.prisma.contentVersionPin.createMany({
      data: authority.map((row) => row.pin),
    });
    admission.assertOpen();
    await this.prisma.publishApproval.createMany({
      data: authority.map((row) => row.approval),
    });
    admission.assertOpen();
    await this.pool.query(
      `UPDATE posts p SET "publishApprovalId"=v.approval,"reviewVersionPinId"=v.pin,"targetExecutionState"=$6,visibility=$7,"externalId"=v.external,"publishedAt"=$8 FROM unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[]) AS v(id,org,approval,pin,external) WHERE p.id=v.id AND p."organizationId"=v.org AND NOT p."isDeleted"`,
      [
        authority.map((row) => row.post.id),
        authority.map((row) => row.post.organizationId),
        authority.map((row) => row.approval.id),
        authority.map((row) => row.pin.id),
        authority.map((row) => `fixture-external-${row.post.id}`),
        TargetExecutionState.PUBLISHED,
        PostVisibility.PUBLIC,
        publicationAt,
      ],
    );
    admission.assertOpen();
    return this.finalizeBatch(authority, admission);
  }

  private async finalizeBatch(
    authority: ReturnType<LearningDatasetScaleFixture['authorityInputs']>[],
    admission: DatasetFixtureAdmission,
  ) {
    const posts = await this.readPosts(authority.map((row) => row.post.id));
    const publicationRows: Publication[] = [];
    for (const organizationId of ['org-0', 'org-1']) {
      const scoped = posts.filter(
        (post) => post.organizationId === organizationId,
      );
      if (!scoped.length) continue;
      const organization = await this.prisma.organization.findFirstOrThrow({
        where: { id: organizationId, isDeleted: false },
        select: learningPublicationOrganizationSelect,
      });
      const brands = await this.prisma.brand.findMany({
        where: { organizationId, isDeleted: false },
        select: learningPublicationBrandSelect,
      });
      const credentials = await this.prisma.credential.findMany({
        where: { organizationId, isDeleted: false },
        select: learningPublicationCredentialSelect,
      });
      const approvals = await this.prisma.publishApproval.findMany({
        where: {
          organizationId,
          id: {
            in: scoped.flatMap((post) =>
              post.publishApprovalId ? [post.publishApprovalId] : [],
            ),
          },
        },
        select: learningPublicationApprovalSelect,
      });
      const pins = await this.prisma.contentVersionPin.findMany({
        where: {
          organizationId,
          id: {
            in: scoped.flatMap((post) =>
              post.reviewVersionPinId ? [post.reviewVersionPinId] : [],
            ),
          },
        },
        select: learningPublicationPinSelect,
      });
      const contexts = scoped.map((post) => {
        const rows = {
          post,
          organization,
          brand: brands.find((row) => row.id === post.brandId) ?? null,
          credential:
            credentials.find((row) => row.id === post.credentialId) ?? null,
          approval:
            approvals.find((row) => row.id === post.publishApprovalId) ?? null,
          pin: pins.find((row) => row.id === post.reviewVersionPinId) ?? null,
        };
        const context = projectLearningPublicationContextV1(
          organizationId,
          post.id,
          rows,
        );
        const association = context && projectAssociation(context);
        if (
          !association ||
          !rows.pin ||
          buildArtifactContentDigest({
            ...projectPostArtifactMaterial(
              readArtifactRecord({ ...post, ingredients: [] }),
            ),
            children: [],
          }) !== rows.pin.contentDigest
        )
          throw new Error('Scale source is not canonically bound');
        return { rows, association };
      });
      admission.assertOpen();
      await this.prisma.postPublishFinalization.createMany({
        data: contexts.map(({ rows, association }) => ({
          id: randomUUID(),
          organizationId,
          postId: rows.post.id,
          source: 'dataset-scale-fixture',
          completedAt: publicationAt,
          result: this.codec.toJson({
            success: true,
            isProviderDraft: false,
            executionState: TargetExecutionState.PUBLISHED,
            platform: Platform.TWITTER,
            externalId: association.externalId,
            learningPublication: association,
          }),
        })),
      });
      admission.assertOpen();
      const finalizations = await this.prisma.postPublishFinalization.findMany({
        where: {
          organizationId,
          postId: { in: scoped.map((post) => post.id) },
        },
        select: learningPublicationFinalizationSelect,
      });
      for (const { rows } of contexts) {
        const source = projectLearningPublicationSourceV1(
          organizationId,
          rows.post.id,
          {
            ...rows,
            finalization:
              finalizations.find((row) => row.postId === rows.post.id) ?? null,
          },
        );
        if (!source) throw new Error('Scale publication authority rejected');
        const index = authority.find(
          (row) => row.post.id === rows.post.id,
        )?.index;
        if (index === undefined) throw new Error('Missing scale source index');
        publicationRows.push({
          index,
          source,
          refs: learningPublicationDependencyRefsV1(source),
        });
      }
    }
    return publicationRows.sort((left, right) => left.index - right.index);
  }

  private async assertBatch(publications: Publication[], scalarAll: boolean) {
    const bulk = new LearningDatasetPublicationPins(this.prisma, 1000);
    for (const organizationId of ['org-0', 'org-1']) {
      const scoped = publications.filter(
        (row) => row.source.organizationId === organizationId,
      );
      const refs = scoped
        .flatMap((row) => row.refs)
        .filter((ref) => ref.organizationId !== null);
      for (const kind of new Set(refs.map((ref) => ref.kind))) {
        const expected = refs.filter((ref) => ref.kind === kind);
        const pins = await bulk.pins(
          kind,
          expected.map((ref) => ref.id),
          organizationId,
        );
        if (expected.some((ref) => pins.get(ref.id) !== ref.version))
          throw new Error('Actual bulk resolver rejected scale authority');
      }
      const scalar = scalarAll
        ? scoped
        : [...scoped.slice(0, 1), ...scoped.slice(-1)];
      for (const publication of scalar) {
        const actual = await resolveLearningPublicationSourceV1(
          this.prisma,
          organizationId,
          publication.source.postId,
        );
        if (JSON.stringify(actual) !== JSON.stringify(publication.source))
          throw new Error('Scalar/bulk publication authority differs');
      }
    }
  }
}
