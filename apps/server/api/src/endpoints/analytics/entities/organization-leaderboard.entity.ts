export class OrgLeaderboardItemEntity {
  declare readonly rank: number;
  declare readonly organization: {
    id: string;
    name: string;
    logo?: string;
  };
  declare readonly totalPosts: number;
  declare readonly totalEngagement: number;
  declare readonly totalViews: number;
  declare readonly avgEngagementRate: number;
  declare readonly growth: number;

  constructor(partial: Partial<OrgLeaderboardItemEntity>) {
    Object.assign(this, partial);
  }
}

export class OrgWithStatsEntity {
  declare readonly id: string;
  declare readonly name: string;
  declare readonly logo?: string;
  declare readonly totalPosts: number;
  declare readonly totalEngagement: number;
  declare readonly totalViews: number;
  declare readonly totalBrands: number;
  declare readonly totalMembers: number;
  declare readonly avgEngagementRate: number;
  declare readonly growth: number;

  constructor(partial: Partial<OrgWithStatsEntity>) {
    Object.assign(this, partial);
  }
}

export class BrandWithStatsEntity {
  declare readonly id: string;
  declare readonly name: string;
  declare readonly logo?: string;
  declare readonly organizationId: string;
  declare readonly organizationName: string;
  declare readonly totalPosts: number;
  declare readonly totalEngagement: number;
  declare readonly totalViews: number;
  declare readonly avgEngagementRate: number;
  declare readonly growth: number;
  declare readonly activePlatforms: string[];

  constructor(partial: Partial<BrandWithStatsEntity>) {
    Object.assign(this, partial);
  }
}

export class PaginatedOrgsResponse {
  declare readonly data: OrgWithStatsEntity[];
  declare readonly pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };

  constructor(partial: Partial<PaginatedOrgsResponse>) {
    Object.assign(this, partial);
  }
}

export class PaginatedBrandsResponse {
  declare readonly data: BrandWithStatsEntity[];
  declare readonly pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };

  constructor(partial: Partial<PaginatedBrandsResponse>) {
    Object.assign(this, partial);
  }
}
