import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsController } from '@api/collections/organizations/controllers/organizations.controller';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { Role } from '@api/collections/roles/schemas/role.schema';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { CreateTagDto } from '@api/collections/tags/dto/create-tag.dto';
import { TagsService } from '@api/collections/tags/services/tags.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import {
  createTestBrand,
  createTestCredential,
  createTestMember,
  createTestOrganization,
  createTestPost,
  createTestTag,
  createTestUser,
} from '@api-test/e2e/e2e-test.utils';
import {
  createTestDatabaseHelper,
  E2ETestModule,
  TestDatabaseHelper,
} from '@api-test/e2e-test.module';
import type { User } from '@clerk/backend';
import {
  INestApplication,
  type NestMiddleware,
  ValidationPipe,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

const BASELINE_FILE = path.resolve(
  __dirname,
  './api-response-benchmarks-baseline.json',
);
const DEFAULT_ITERATIONS = 40;
const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_REGRESSION_THRESHOLD_PCT = 20;
const DEFAULT_WARMUP = 10;
const SEED_BRANDS = 180;
const SEED_CREDENTIALS = 90;
const SEED_MEMBER_ID = '65f000000000000000000004';
const SEED_POSTS = 120;
const SEED_ORGANIZATION_ID = '65f000000000000000000003';
const SEED_ROLE_ID = '65f000000000000000000002';
const SEED_TAGS_GLOBAL = 30;
const SEED_TAGS_ORGANIZATION = 90;
const SEED_TAGS_USER = 45;
const SEED_USER_ID = '65f000000000000000000001';

type BenchmarkMetric = 'p50Ms' | 'p95Ms';

type ApiBenchmarkCliOptions = {
  isJson: boolean;
  iterations: number;
  reportDir: string | null;
  updateBaseline: boolean;
  warmup: number;
};

type ApiBenchmarkHeaders = {
  Authorization: string;
  'x-brand-id': string;
  'x-clerk-user-id': string;
  'x-organization-id': string;
  'x-user-id': string;
};

type ApiBenchmarkHarness = {
  app: INestApplication;
  headers: ApiBenchmarkHeaders;
  moduleRef: TestingModule;
  organizationId: string;
};

type ApiBenchmarkEndpoint = {
  buildPath: (ctx: ApiBenchmarkHarness) => string;
  id: string;
  label: string;
  method: 'GET';
};

type ApiBenchmarkSummary = {
  iterations: number;
  maxMs: number;
  meanMs: number;
  minMs: number;
  p50Ms: number;
  p95Ms: number;
  warmup: number;
};

type ApiBenchmarkEndpointResult = {
  id: string;
  label: string;
  method: 'GET';
  route: string;
  summary: ApiBenchmarkSummary;
};

type ApiBenchmarkBaselineEndpoint = {
  iterations: number;
  label: string;
  method: 'GET';
  p50Ms: number;
  p95Ms: number;
  route: string;
  warmup: number;
};

type ApiBenchmarkBaselineFile = {
  endpoints: Record<string, ApiBenchmarkBaselineEndpoint>;
  generatedAt: string;
  regressionThresholdPct: number;
};

type ApiBenchmarkRegression = {
  baselineMs: number;
  currentMs: number;
  deltaPct: number;
  endpointId: string;
  label: string;
  metric: BenchmarkMetric;
  route: string;
};

type ApiBenchmarkRunResult = {
  baselineGeneratedAt: string | null;
  endpoints: ApiBenchmarkEndpointResult[];
  generatedAt: string;
  missingBaselineEndpointIds: string[];
  regressionThresholdPct: number;
  regressions: ApiBenchmarkRegression[];
};

type ApiBenchmarkSeedState = {
  brandId: string;
  clerkUserId: string;
  organizationId: string;
  userId: string;
};

const API_BENCHMARK_ENDPOINTS: ApiBenchmarkEndpoint[] = [
  {
    buildPath: (ctx) =>
      `/v1/organizations/${ctx.organizationId}/brands?page=1&limit=${DEFAULT_PAGE_SIZE}`,
    id: 'organization-brands-list',
    label: 'Organization Brands List',
    method: 'GET',
  },
  {
    buildPath: (ctx) =>
      `/v1/organizations/${ctx.organizationId}/posts?page=1&limit=${DEFAULT_PAGE_SIZE}`,
    id: 'organization-posts-list',
    label: 'Organization Posts List',
    method: 'GET',
  },
];

export async function runApiResponseBenchmarks(
  options: Partial<ApiBenchmarkCliOptions> = {},
): Promise<ApiBenchmarkRunResult> {
  const cliOptions = normalizeCliOptions(options);
  const harness = await createBenchmarkHarness();

  try {
    const endpointResults: ApiBenchmarkEndpointResult[] = [];

    for (const endpoint of API_BENCHMARK_ENDPOINTS) {
      endpointResults.push(
        await benchmarkEndpoint(harness, endpoint, cliOptions),
      );
    }

    const baseline = readBaselineFile(BASELINE_FILE);
    const { missingBaselineEndpointIds, regressions } = detectRegressions(
      endpointResults,
      baseline,
      DEFAULT_REGRESSION_THRESHOLD_PCT,
    );

    const runResult: ApiBenchmarkRunResult = {
      baselineGeneratedAt: baseline?.generatedAt ?? null,
      endpoints: endpointResults,
      generatedAt: new Date().toISOString(),
      missingBaselineEndpointIds,
      regressions,
      regressionThresholdPct: DEFAULT_REGRESSION_THRESHOLD_PCT,
    };

    if (cliOptions.reportDir) {
      writeReportArtifacts(cliOptions.reportDir, runResult);
    }

    if (cliOptions.updateBaseline) {
      writeBaselineFile(BASELINE_FILE, endpointResults);
    }

    return runResult;
  } finally {
    await harness.app.close();
    await harness.moduleRef.close();
  }
}

export function calculateLatencySummary(
  samples: number[],
  iterations: number,
  warmup: number,
): ApiBenchmarkSummary {
  if (samples.length === 0) {
    throw new Error('Latency summary requires at least one measured sample');
  }

  const sortedSamples = [...samples].sort((left, right) => left - right);
  const total = samples.reduce((sum, sample) => sum + sample, 0);

  return {
    iterations,
    maxMs: roundMs(sortedSamples.at(-1) ?? 0),
    meanMs: roundMs(total / samples.length),
    minMs: roundMs(sortedSamples[0] ?? 0),
    p50Ms: roundMs(calculatePercentile(sortedSamples, 50)),
    p95Ms: roundMs(calculatePercentile(sortedSamples, 95)),
    warmup,
  };
}

export function detectRegressions(
  endpointResults: ApiBenchmarkEndpointResult[],
  baseline: ApiBenchmarkBaselineFile | null,
  regressionThresholdPct: number,
): {
  missingBaselineEndpointIds: string[];
  regressions: ApiBenchmarkRegression[];
} {
  if (!baseline) {
    return {
      missingBaselineEndpointIds: endpointResults.map(
        (endpoint) => endpoint.id,
      ),
      regressions: [],
    };
  }

  const regressions: ApiBenchmarkRegression[] = [];
  const missingBaselineEndpointIds: string[] = [];

  for (const endpointResult of endpointResults) {
    const endpointBaseline = baseline.endpoints[endpointResult.id];
    if (!endpointBaseline) {
      missingBaselineEndpointIds.push(endpointResult.id);
      continue;
    }

    for (const metric of ['p50Ms', 'p95Ms'] satisfies BenchmarkMetric[]) {
      const baselineValue = endpointBaseline[metric];
      const currentValue = endpointResult.summary[metric];
      if (baselineValue <= 0) {
        continue;
      }

      const deltaPct = roundMs(
        ((currentValue - baselineValue) / baselineValue) * 100,
      );
      if (deltaPct <= regressionThresholdPct) {
        continue;
      }

      regressions.push({
        baselineMs: baselineValue,
        currentMs: currentValue,
        deltaPct,
        endpointId: endpointResult.id,
        label: endpointResult.label,
        metric,
        route: endpointResult.route,
      });
    }
  }

  return { missingBaselineEndpointIds, regressions };
}

export function buildMarkdownReport(result: ApiBenchmarkRunResult): string {
  const lines: string[] = [
    '# API Response Benchmarks',
    '',
    `- Generated at: ${result.generatedAt}`,
    `- Baseline: ${result.baselineGeneratedAt ?? 'missing'}`,
    `- Regression threshold: ${result.regressionThresholdPct}%`,
    '',
    '| Endpoint | Route | p50 (ms) | p95 (ms) | Mean (ms) | Status |',
    '| --- | --- | ---: | ---: | ---: | --- |',
  ];

  const regressionKeys = new Set(
    result.regressions.map(
      (regression) => `${regression.endpointId}:${regression.metric}`,
    ),
  );

  for (const endpoint of result.endpoints) {
    const hasRegression =
      regressionKeys.has(`${endpoint.id}:p50Ms`) ||
      regressionKeys.has(`${endpoint.id}:p95Ms`);
    const status = result.missingBaselineEndpointIds.includes(endpoint.id)
      ? 'missing baseline'
      : hasRegression
        ? 'regression'
        : 'ok';

    lines.push(
      `| ${endpoint.label} | \`${endpoint.route}\` | ${endpoint.summary.p50Ms.toFixed(2)} | ${endpoint.summary.p95Ms.toFixed(2)} | ${endpoint.summary.meanMs.toFixed(2)} | ${status} |`,
    );
  }

  if (result.regressions.length > 0) {
    lines.push('', '## Regressions', '');

    for (const regression of result.regressions) {
      lines.push(
        `- ${regression.label} ${regression.metric}: ${regression.currentMs.toFixed(2)}ms vs ${regression.baselineMs.toFixed(2)}ms baseline (+${regression.deltaPct.toFixed(2)}%)`,
      );
    }
  }

  if (result.missingBaselineEndpointIds.length > 0) {
    lines.push('', '## Missing Baseline Entries', '');
    for (const endpointId of result.missingBaselineEndpointIds) {
      lines.push(`- ${endpointId}`);
    }
  }

  lines.push(
    '',
    '## Refresh Baseline',
    '',
    '`bun run check:api-response-benchmarks --update-baseline`',
  );

  return `${lines.join('\n')}\n`;
}

function normalizeCliOptions(
  options: Partial<ApiBenchmarkCliOptions>,
): ApiBenchmarkCliOptions {
  return {
    isJson: options.isJson ?? false,
    iterations: options.iterations ?? DEFAULT_ITERATIONS,
    reportDir: options.reportDir ?? null,
    updateBaseline: options.updateBaseline ?? false,
    warmup: options.warmup ?? DEFAULT_WARMUP,
  };
}

async function benchmarkEndpoint(
  harness: ApiBenchmarkHarness,
  endpoint: ApiBenchmarkEndpoint,
  options: ApiBenchmarkCliOptions,
): Promise<ApiBenchmarkEndpointResult> {
  const route = endpoint.buildPath(harness);
  const measuredSamples: number[] = [];

  for (
    let iteration = 0;
    iteration < options.warmup + options.iterations;
    iteration += 1
  ) {
    const startedAt = performance.now();
    const response = await request(harness.app.getHttpServer())
      .get(route)
      .set(harness.headers);

    if (response.status !== 200) {
      throw new Error(
        `Benchmark request failed for ${endpoint.id} (${route}) with ${response.status}: ${JSON.stringify(response.body)}`,
      );
    }

    const elapsedMs = performance.now() - startedAt;

    if (iteration >= options.warmup) {
      measuredSamples.push(elapsedMs);
    }
  }

  return {
    id: endpoint.id,
    label: endpoint.label,
    method: endpoint.method,
    route,
    summary: calculateLatencySummary(
      measuredSamples,
      options.iterations,
      options.warmup,
    ),
  };
}

async function createBenchmarkHarness(): Promise<ApiBenchmarkHarness> {
  const moduleConfig = await E2ETestModule.forRoot({
    controllers: [OrganizationsController],
    providers: [
      OrganizationsService,
      MembersService,
      TagsService,
      PostsService,
      BrandsService,
      {
        provide: ActivitiesService,
        useValue: {},
      },
      {
        provide: VideosService,
        useValue: {},
      },
      {
        provide: IngredientsService,
        useValue: {},
      },
      {
        provide: UsersService,
        useValue: {},
      },
      {
        provide: RolesService,
        useValue: {},
      },
      {
        provide: OrganizationSettingsService,
        useValue: {},
      },
      {
        provide: ClerkService,
        useValue: {},
      },
      {
        provide: RequestContextCacheService,
        useValue: {},
      },
      {
        provide: AccessBootstrapCacheService,
        useValue: {},
      },
      {
        provide: BrandScraperService,
        useValue: {},
      },
      {
        provide: LlmDispatcherService,
        useValue: {},
      },
      {
        provide: CacheInvalidationService,
        useValue: {
          invalidate: async () => undefined,
          invalidatePattern: async () => undefined,
        },
      },
    ],
  });

  const moduleRef = await Test.createTestingModule({
    imports: [moduleConfig],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.use(createBenchmarkAuthMiddleware());
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.setGlobalPrefix('v1');
  await app.init();

  const dbHelper = createTestDatabaseHelper(moduleRef);
  const seedState = await seedBenchmarkData(dbHelper);

  return {
    app,
    headers: {
      Authorization: 'Bearer benchmark-token',
      'x-brand-id': seedState.brandId,
      'x-clerk-user-id': seedState.clerkUserId,
      'x-organization-id': seedState.organizationId,
      'x-user-id': seedState.userId,
    },
    moduleRef,
    organizationId: seedState.organizationId,
  };
}

function createBenchmarkAuthMiddleware(): NestMiddleware['use'] {
  return (req, _res, next) => {
    const clerkUserId =
      readHeaderValue(req.headers['x-clerk-user-id']) ?? 'clerk-benchmark-user';
    const organizationId =
      readHeaderValue(req.headers['x-organization-id']) ?? '';
    const userId = readHeaderValue(req.headers['x-user-id']) ?? '';
    const brandId = readHeaderValue(req.headers['x-brand-id']) ?? '';

    const currentUser = {
      id: clerkUserId,
      publicMetadata: {
        brand: brandId,
        email: 'benchmark@example.com',
        isOwner: true,
        isSuperAdmin: false,
        organization: organizationId,
        user: userId,
      },
    } as User;

    (req as typeof req & { user?: User }).user = currentUser;
    next();
  };
}

async function seedBenchmarkData(
  dbHelper: TestDatabaseHelper,
): Promise<ApiBenchmarkSeedState> {
  await dbHelper.clearDatabase();

  const user = createTestUser({
    _id: randomUUID(SEED_USER_ID),
    clerkId: 'clerk_api_benchmark_user',
    email: 'api-benchmark@example.com',
  });
  const role = {
    _id: randomUUID(SEED_ROLE_ID),
    isDeleted: false,
    key: 'owner',
    label: 'Owner',
    primaryColor: '#0f766e',
  } satisfies Role;
  const organization = createTestOrganization({
    _id: randomUUID(SEED_ORGANIZATION_ID),
    label: 'API Benchmark Organization',
    user: user._id,
  });
  const member = createTestMember({
    _id: randomUUID(SEED_MEMBER_ID),
    organization: organization._id,
    role: role._id,
    user: user._id,
  });

  const brands = Array.from({ length: SEED_BRANDS }, (_, index) =>
    createTestBrand({
      _id: randomUUID(),
      handle: `benchmark-brand-${index + 1}`,
      label: `Benchmark Brand ${index + 1}`,
      organization: organization._id,
      user: user._id,
    }),
  );

  const credentials = Array.from({ length: SEED_CREDENTIALS }, (_, index) =>
    createTestCredential({
      _id: randomUUID(),
      brand: brands[index % brands.length]?._id,
      externalHandle: `@benchmark_${index + 1}`,
      externalId: `benchmark-credential-${index + 1}`,
      organization: organization._id,
      user: user._id,
    }),
  );

  const tags: Array<CreateTagDto & { _id: string }> = [
    ...Array.from({ length: SEED_TAGS_GLOBAL }, (_, index) => {
      const tag = createTestTag({
        _id: randomUUID(),
        color: '#334155',
        label: `Global Benchmark Tag ${index + 1}`,
      }) as CreateTagDto & { _id: string };
      delete (tag as Record<string, unknown>).organization;
      delete (tag as Record<string, unknown>).user;
      return tag;
    }),
    ...Array.from(
      { length: SEED_TAGS_ORGANIZATION },
      (_, index) =>
        createTestTag({
          _id: randomUUID(),
          color: '#0f766e',
          label: `Organization Benchmark Tag ${index + 1}`,
          organization: organization._id,
          user: user._id,
        }) as CreateTagDto & { _id: string },
    ),
    ...Array.from(
      { length: SEED_TAGS_USER },
      (_, index) =>
        createTestTag({
          _id: randomUUID(),
          color: '#7c3aed',
          label: `User Benchmark Tag ${index + 1}`,
          user: user._id,
        }) as CreateTagDto & { _id: string },
    ),
  ];

  const posts = Array.from({ length: SEED_POSTS }, (_, index) =>
    createTestPost({
      _id: randomUUID(),
      brand: brands[index % brands.length]?._id,
      caption: `Benchmark post ${index + 1}`,
      credential: credentials[index % credentials.length]?._id,
      ingredients: [],
      label: `Benchmark Post ${index + 1}`,
      organization: organization._id,
      status: 'public',
      user: user._id,
    }),
  );

  await dbHelper.seedCollection('users', [user]);
  await dbHelper.seedCollection('roles', [role]);
  await dbHelper.seedCollection('organizations', [organization]);
  await dbHelper.seedCollection('members', [member]);
  await dbHelper.seedCollection('brands', brands);
  await dbHelper.seedCollection('credentials', credentials);
  await dbHelper.seedCollection('tags', tags);
  await dbHelper.seedCollection('posts', posts);

  return {
    brandId: String(brands[0]?._id ?? ''),
    clerkUserId: user.clerkId,
    organizationId: String(organization._id),
    userId: String(user._id),
  };
}

function calculatePercentile(
  sortedSamples: number[],
  percentile: number,
): number {
  if (sortedSamples.length === 0) {
    throw new Error('Cannot calculate percentile from an empty sample set');
  }

  if (sortedSamples.length === 1) {
    return sortedSamples[0] ?? 0;
  }

  const rank = (percentile / 100) * (sortedSamples.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const weight = rank - lowerIndex;

  const lowerValue = sortedSamples[lowerIndex] ?? 0;
  const upperValue = sortedSamples[upperIndex] ?? lowerValue;

  return lowerValue + (upperValue - lowerValue) * weight;
}

function readBaselineFile(filePath: string): ApiBenchmarkBaselineFile | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(
    fs.readFileSync(filePath, 'utf8'),
  ) as ApiBenchmarkBaselineFile;
}

function writeBaselineFile(
  filePath: string,
  endpointResults: ApiBenchmarkEndpointResult[],
): void {
  const baseline: ApiBenchmarkBaselineFile = {
    endpoints: Object.fromEntries(
      endpointResults.map((endpointResult) => [
        endpointResult.id,
        {
          iterations: endpointResult.summary.iterations,
          label: endpointResult.label,
          method: endpointResult.method,
          p50Ms: endpointResult.summary.p50Ms,
          p95Ms: endpointResult.summary.p95Ms,
          route: endpointResult.route,
          warmup: endpointResult.summary.warmup,
        } satisfies ApiBenchmarkBaselineEndpoint,
      ]),
    ),
    generatedAt: new Date().toISOString(),
    regressionThresholdPct: DEFAULT_REGRESSION_THRESHOLD_PCT,
  };

  fs.writeFileSync(filePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
}

function writeReportArtifacts(
  reportDir: string,
  result: ApiBenchmarkRunResult,
): void {
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(
    path.join(reportDir, 'api-response-benchmarks.json'),
    `${JSON.stringify(result, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(reportDir, 'api-response-benchmarks.md'),
    buildMarkdownReport(result),
    'utf8',
  );
}

function readHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function roundMs(value: number): number {
  return Number(value.toFixed(2));
}

function parseCliArgs(argv: string[]): ApiBenchmarkCliOptions {
  let isJson = false;
  let iterations = DEFAULT_ITERATIONS;
  let reportDir: string | null = null;
  let updateBaseline = false;
  let warmup = DEFAULT_WARMUP;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--json') {
      isJson = true;
      continue;
    }

    if (arg === '--update-baseline') {
      updateBaseline = true;
      continue;
    }

    if (arg === '--report-dir') {
      reportDir = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === '--iterations') {
      const parsedIterations = Number.parseInt(argv[index + 1] ?? '', 10);
      if (Number.isFinite(parsedIterations) && parsedIterations > 0) {
        iterations = parsedIterations;
      }
      index += 1;
      continue;
    }

    if (arg === '--warmup') {
      const parsedWarmup = Number.parseInt(argv[index + 1] ?? '', 10);
      if (Number.isFinite(parsedWarmup) && parsedWarmup >= 0) {
        warmup = parsedWarmup;
      }
      index += 1;
    }
  }

  return {
    isJson,
    iterations,
    reportDir,
    updateBaseline,
    warmup,
  };
}

async function main(): Promise<void> {
  const cliOptions = parseCliArgs(process.argv.slice(2));
  const result = await runApiResponseBenchmarks(cliOptions);

  if (cliOptions.isJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(buildMarkdownReport(result));
  }

  if (!cliOptions.updateBaseline && result.regressions.length > 0) {
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  void main();
}
