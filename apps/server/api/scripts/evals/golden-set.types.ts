import type {
  EXCLUSION_REASONS,
  GOLDEN_CONTENT_KINDS,
  GOLDEN_LABEL_SOURCES,
} from './golden-set.constants';

export type GoldenContentKind = (typeof GOLDEN_CONTENT_KINDS)[number];
export type GoldenLabelSource = (typeof GOLDEN_LABEL_SOURCES)[number];
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];
export type GoldenSetExcluded = Record<ExclusionReason, number>;
export type GoldenDecision = 'approve' | 'reject';
export type GoldenSetVisibility = 'synthetic' | 'private';

export interface GoldenLabel {
  source: GoldenLabelSource;
  raterKey: string;
  decision: GoldenDecision | null;
  score: number | null;
  order: [epochMs: number, recordId: string];
}

export interface GoldenBrandTerm {
  term: string;
  brandFixtureId: string;
}

export interface AnonymisationContext {
  knownIds: string[];
  brandTerms: GoldenBrandTerm[];
  organizationTerms: string[];
  personTerms: string[];
}

export interface PreparedTerm {
  term: string;
  token: string;
}

export type ResidualCategory =
  | 'brand'
  | 'email'
  | 'handle'
  | 'id'
  | 'organization'
  | 'person'
  | 'url';

export interface GoldenSetScope {
  organizationId: string;
  brandIds: string[];
}

export interface GoldenSetWindow {
  from: Date;
  to: Date;
}

export interface GoldenOrganizationRecord {
  id: string;
  label: string;
  slug: string;
}

export interface GoldenBrandRecord {
  id: string;
  label: string;
  slug: string;
}

export interface GoldenCredentialRecord {
  brandId: string | null;
  externalHandle: string | null;
  externalName: string | null;
  username: string | null;
}

export interface GoldenMemberUserRecord {
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  handle: string;
}

export interface GoldenMemberRecord {
  user: GoldenMemberUserRecord;
}

export interface GoldenScopedRecord {
  id: string;
  organizationId: string;
  isDeleted: boolean;
  createdAt: Date;
}

export interface GoldenPostRecord extends GoldenScopedRecord {
  brandId: string;
  parentId: string | null;
  order: number;
  format: string;
  category: string;
  description: string;
  promptUsed: string | null;
  platform: string | null;
  reviewDecision: string | null;
  reviewEvents: unknown;
}

export interface GoldenBatchItemRecord extends GoldenScopedRecord {
  brandId: string | null;
  reviewDecision: string | null;
  data: unknown;
}

export interface GoldenEvaluationRecord extends GoldenScopedRecord {
  contentType: string | null;
  contentId: string | null;
  data: unknown;
}

export interface GoldenArticleRecord extends GoldenScopedRecord {
  brandId: string | null;
  content: string | null;
  summary: string | null;
}

export interface GoldenNewsletterRecord extends GoldenScopedRecord {
  brandId: string | null;
  content: string | null;
  summary: string | null;
  generationPrompt: string | null;
  approvedAt: Date | null;
  approvedByUserId: string | null;
}

export interface GoldenProfileRecord extends GoldenScopedRecord {
  data: unknown;
}

export interface GoldenContextBaseRecord extends GoldenScopedRecord {
  data: unknown;
}

export interface GoldenContextEntryRecord extends GoldenScopedRecord {
  contextBaseId: string;
  data: unknown;
}

export interface GoldenSetScopeSnapshot {
  scope: GoldenSetScope;
  organization: GoldenOrganizationRecord;
  brands: GoldenBrandRecord[];
  credentials: GoldenCredentialRecord[];
  members: GoldenMemberRecord[];
  posts: GoldenPostRecord[];
  batchItems: GoldenBatchItemRecord[];
  evaluations: GoldenEvaluationRecord[];
  newsletters: GoldenNewsletterRecord[];
  profiles: GoldenProfileRecord[];
  contextBases: GoldenContextBaseRecord[];
  contextEntries: GoldenContextEntryRecord[];
  linkedPosts: GoldenPostRecord[];
  linkedArticles: GoldenArticleRecord[];
  linkedNewsletters: GoldenNewsletterRecord[];
  linkedBatchItems: GoldenBatchItemRecord[];
  threadChildren: GoldenPostRecord[];
}

export interface GoldenSetReader {
  readScope(
    scope: GoldenSetScope,
    window: GoldenSetWindow,
  ): Promise<GoldenSetScopeSnapshot>;
}

export interface GoldenSetSyntheticExportArgs {
  source: 'synthetic';
  outDir: string;
}

export interface GoldenSetDatabaseExportArgs {
  source: 'database';
  outDir: string;
  keyFile: string;
  scopes: GoldenSetScope[];
  window: GoldenSetWindow;
  authorization: string;
}

export type GoldenSetExportArgs =
  | GoldenSetSyntheticExportArgs
  | GoldenSetDatabaseExportArgs;

export interface GoldenAgreementFloor {
  minKappa: number;
  minPairs: number;
  minPercentAgreementWhenKappaUndefined: number;
}

export type GoldenAgreementStatus = 'insufficient-overlap' | 'kept' | 'dropped';

export interface GoldenSourceAgreement {
  source: GoldenLabelSource;
  labels: number;
  pairs: number;
  percentAgreement: number | null;
  kappa: number | null;
  status: GoldenAgreementStatus;
}

export interface GoldenKindQuality {
  contentKind: GoldenContentKind;
  rows: number;
  brands: number;
  approve: number;
  reject: number;
  withScoreBand: number;
}

export interface GoldenReportWindow {
  from: string;
  to: string;
}

export interface LabelQualityReport {
  schemaVersion: 1;
  setVersion: 'golden-set-v1';
  visibility: GoldenSetVisibility;
  window: GoldenReportWindow | null;
  scopeCount: number;
  agreementFloor: GoldenAgreementFloor;
  sources: GoldenSourceAgreement[];
  kinds: GoldenKindQuality[];
  excluded: GoldenSetExcluded;
}

export interface GoldenStringFilter {
  in?: string[];
  gt?: string;
  not?: null;
}

export interface GoldenDateFilter {
  gte?: Date;
  lt?: Date;
  gt?: Date;
  not?: null;
}

export interface GoldenJsonFilter {
  path: string[];
  equals: string;
}

export interface GoldenSetRecordWhere {
  organizationId: string;
  isDeleted: false;
  id?: string | GoldenStringFilter;
  brandId?: string | GoldenStringFilter;
  parentId?: null | GoldenStringFilter;
  contentType?: GoldenStringFilter;
  contextBaseId?: GoldenStringFilter;
  reviewDecision?: GoldenStringFilter;
  approvedAt?: GoldenDateFilter;
  approvedByUserId?: GoldenStringFilter;
  createdAt?: Date | GoldenDateFilter;
  data?: GoldenJsonFilter;
  OR?: GoldenKeysetCursor[];
}

export interface GoldenKeysetCursor {
  createdAt: Date | GoldenDateFilter;
  id?: GoldenStringFilter;
}

export interface GoldenOrganizationWhere {
  id: string;
  isDeleted: false;
}

export interface GoldenRecordOrder {
  createdAt?: 'asc';
  id?: 'asc';
  order?: 'asc';
}

export interface GoldenFindManyArgs {
  where: GoldenSetRecordWhere;
  orderBy: GoldenRecordOrder[];
  take?: number;
}

export interface GoldenBrandSelect {
  id: true;
  label: true;
  slug: true;
}

export interface GoldenCredentialSelect {
  brandId: true;
  externalHandle: true;
  externalName: true;
  username: true;
}

export interface GoldenMemberSelect {
  user: {
    select: {
      firstName: true;
      lastName: true;
      name: true;
      handle: true;
    };
  };
}

export interface GoldenSelectedFindManyArgs<TSelect>
  extends GoldenFindManyArgs {
  select: TSelect;
}

export interface GoldenFindManyDelegate<TRow> {
  findMany(args: GoldenFindManyArgs): Promise<readonly TRow[]>;
}

export interface GoldenSelectedFindManyDelegate<TRow, TSelect> {
  findMany(args: GoldenSelectedFindManyArgs<TSelect>): Promise<readonly TRow[]>;
}

export interface GoldenOrganizationFindFirstArgs {
  where: GoldenOrganizationWhere;
  orderBy: GoldenRecordOrder[];
}

export interface GoldenOrganizationDelegate {
  findFirst(
    args: GoldenOrganizationFindFirstArgs,
  ): Promise<GoldenOrganizationRecord | null>;
}

export interface GoldenSetPrismaClient {
  organization: GoldenOrganizationDelegate;
  brand: GoldenSelectedFindManyDelegate<GoldenBrandRecord, GoldenBrandSelect>;
  credential: GoldenSelectedFindManyDelegate<
    GoldenCredentialRecord,
    GoldenCredentialSelect
  >;
  member: GoldenSelectedFindManyDelegate<
    GoldenMemberRecord,
    GoldenMemberSelect
  >;
  post: GoldenFindManyDelegate<GoldenPostRecord>;
  batchItem: GoldenFindManyDelegate<GoldenBatchItemRecord>;
  evaluation: GoldenFindManyDelegate<GoldenEvaluationRecord>;
  article: GoldenFindManyDelegate<GoldenArticleRecord>;
  newsletter: GoldenFindManyDelegate<GoldenNewsletterRecord>;
  profile: GoldenFindManyDelegate<GoldenProfileRecord>;
  contextBase: GoldenFindManyDelegate<GoldenContextBaseRecord>;
  contextEntry: GoldenFindManyDelegate<GoldenContextEntryRecord>;
}
