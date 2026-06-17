import { memo, type ReactNode, useMemo } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  EmptyState,
  ErrorScreen,
  LoadingScreen,
} from '@/components/ScreenStates';
import { colors } from '@/constants';
import { useAnalytics } from '@/hooks/use-analytics';
import { formatNumber, formatPercentage } from '@/utils/format-date';

interface StatCardProps {
  label: string;
  value: string;
  growth?: number;
  icon: string;
}

function StatCard({ label, value, growth, icon }: StatCardProps) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {growth !== undefined && (
        <Text
          style={[
            styles.statGrowth,
            growth >= 0 ? styles.positive : styles.negative,
          ]}
        >
          {formatPercentage(growth)}
        </Text>
      )}
    </View>
  );
}

interface PlatformCardProps {
  platform: string;
  views: number;
  posts: number;
  engagementRate: number;
}

const PLATFORM_ICONS: Record<string, string> = {
  instagram: 'I',
  pinterest: 'P',
  tiktok: 'T',
  twitter: 'X',
  youtube: 'Y',
};

function PlatformCard({
  platform,
  views,
  posts,
  engagementRate,
}: PlatformCardProps) {
  return (
    <View style={styles.platformCard}>
      <View style={styles.platformIconContainer}>
        <Text style={styles.platformIcon}>
          {PLATFORM_ICONS[platform.toLowerCase()] || platform[0]}
        </Text>
      </View>
      <View style={styles.platformInfo}>
        <Text style={styles.platformName}>{platform}</Text>
        <Text style={styles.platformStats}>
          {formatNumber(views)} views | {posts} posts
        </Text>
      </View>
      <View style={styles.platformEngagement}>
        <Text style={styles.engagementValue}>{engagementRate.toFixed(1)}%</Text>
        <Text style={styles.engagementLabel}>Eng.</Text>
      </View>
    </View>
  );
}

interface TopContentCardProps {
  rank: number;
  title: string;
  platform: string;
  views: number;
}

function TopContentCard({ rank, title, platform, views }: TopContentCardProps) {
  return (
    <View style={styles.topContentCard}>
      <View style={styles.rankBadge}>
        <Text style={styles.rankText}>#{rank}</Text>
      </View>
      <View style={styles.topContentInfo}>
        <Text style={styles.topContentTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.topContentPlatform}>{platform}</Text>
      </View>
      <View style={styles.topContentMetrics}>
        <Text style={styles.topContentViews}>{formatNumber(views)}</Text>
        <Text style={styles.topContentViewsLabel}>views</Text>
      </View>
    </View>
  );
}

interface EngagementBreakdownProps {
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  likesPercentage: number;
  commentsPercentage: number;
  sharesPercentage: number;
  savesPercentage: number;
}

function EngagementBreakdown({
  likes,
  comments,
  shares,
  saves,
  likesPercentage,
  commentsPercentage,
  sharesPercentage,
  savesPercentage,
}: EngagementBreakdownProps) {
  return (
    <View style={styles.engagementSection}>
      <View style={styles.engagementBar}>
        <View
          style={[
            styles.engagementSegment,
            styles.likesBar,
            { flex: likesPercentage },
          ]}
        />
        <View
          style={[
            styles.engagementSegment,
            styles.commentsBar,
            { flex: commentsPercentage },
          ]}
        />
        <View
          style={[
            styles.engagementSegment,
            styles.sharesBar,
            { flex: sharesPercentage },
          ]}
        />
        <View
          style={[
            styles.engagementSegment,
            styles.savesBar,
            { flex: savesPercentage },
          ]}
        />
      </View>
      <View style={styles.engagementLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.likesBar]} />
          <Text style={styles.legendText}>Likes {formatNumber(likes)}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.commentsBar]} />
          <Text style={styles.legendText}>
            Comments {formatNumber(comments)}
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.sharesBar]} />
          <Text style={styles.legendText}>Shares {formatNumber(shares)}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.savesBar]} />
          <Text style={styles.legendText}>Saves {formatNumber(saves)}</Text>
        </View>
      </View>
    </View>
  );
}

const AnalyticsScrollContainer = memo(function AnalyticsScrollContainer({
  children,
  isLoading,
  onRefresh,
}: {
  children: ReactNode;
  isLoading: boolean;
  onRefresh: () => void;
}) {
  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={isLoading}
        onRefresh={onRefresh}
        tintColor={colors.indigo}
      />
    ),
    [isLoading, onRefresh],
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  );
});

export default function AnalyticsScreen() {
  const { data, isLoading, error, refetch } = useAnalytics();

  if (isLoading && !data.overview) {
    return (
      <LoadingScreen message="Loading analytics..." color={colors.indigo} />
    );
  }

  if (error) {
    return (
      <ErrorScreen
        message="Failed to load analytics"
        onRetry={refetch}
        retryLabel="Retry"
      />
    );
  }

  const { overview, topContent, platformStats, engagement } = data;

  return (
    <AnalyticsScrollContainer isLoading={isLoading} onRefresh={refetch}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Analytics</Text>
        <Text style={styles.headerSubtitle}>Last 7 days</Text>
      </View>

      {overview && (
        <View style={styles.statsGrid}>
          <StatCard
            label="Total Views"
            value={formatNumber(overview.totalViews)}
            growth={overview.viewsGrowth}
            icon="O"
          />
          <StatCard
            label="Engagement"
            value={formatNumber(overview.totalEngagement)}
            growth={overview.engagementGrowth}
            icon="+"
          />
          <StatCard
            label="Posts"
            value={formatNumber(overview.totalPosts)}
            icon="#"
          />
          <StatCard
            label="Avg. Rate"
            value={`${overview.avgEngagementRate?.toFixed(1) || 0}%`}
            icon="%"
          />
        </View>
      )}

      {engagement && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Engagement Breakdown</Text>
          <EngagementBreakdown
            likes={engagement.likes}
            comments={engagement.comments}
            shares={engagement.shares}
            saves={engagement.saves}
            likesPercentage={engagement.likesPercentage || 25}
            commentsPercentage={engagement.commentsPercentage || 25}
            sharesPercentage={engagement.sharesPercentage || 25}
            savesPercentage={engagement.savesPercentage || 25}
          />
        </View>
      )}

      {platformStats.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>By Platform</Text>
          {platformStats.map((platform, index) => (
            <PlatformCard
              key={platform.platform || index}
              platform={platform.platform}
              views={platform.totalViews}
              posts={platform.totalPosts}
              engagementRate={platform.engagementRate}
            />
          ))}
        </View>
      )}

      {topContent.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Performing</Text>
          {topContent.map((content, index) => (
            <TopContentCard
              key={content.id || index}
              rank={index + 1}
              title={content.title || 'Untitled'}
              platform={content.platform}
              views={content.views}
            />
          ))}
        </View>
      )}

      {!overview && !isLoading && (
        <EmptyState
          title="No analytics yet"
          message="Start publishing content to see your performance metrics"
        />
      )}
    </AnalyticsScrollContainer>
  );
}

const styles = StyleSheet.create({
  commentsBar: {
    backgroundColor: colors.info,
  },
  container: {
    backgroundColor: colors.bgSecondary,
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  engagementBar: {
    borderRadius: 4,
    flexDirection: 'row',
    height: 8,
    marginBottom: 16,
    overflow: 'hidden',
  },
  engagementLabel: {
    color: colors.textMuted,
    fontSize: 11,
  },
  engagementLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  engagementSection: {
    backgroundColor: colors.bgTertiary,
    borderRadius: 12,
    padding: 16,
  },
  engagementSegment: {
    height: '100%',
  },
  engagementValue: {
    color: colors.indigo,
    fontSize: 16,
    fontWeight: 'bold',
  },
  header: {
    marginBottom: 24,
  },
  headerSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 4,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: 'bold',
  },
  legendDot: {
    borderRadius: 5,
    height: 10,
    marginRight: 8,
    width: 10,
  },
  legendItem: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 8,
    width: '50%',
  },
  legendText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  likesBar: {
    backgroundColor: colors.error,
  },
  negative: {
    color: colors.error,
  },
  platformCard: {
    alignItems: 'center',
    backgroundColor: colors.bgTertiary,
    borderRadius: 12,
    flexDirection: 'row',
    marginBottom: 8,
    padding: 14,
  },
  platformEngagement: {
    alignItems: 'flex-end',
  },
  platformIcon: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  platformIconContainer: {
    alignItems: 'center',
    backgroundColor: colors.bgBorder,
    borderRadius: 10,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  platformInfo: {
    flex: 1,
    marginLeft: 12,
  },
  platformName: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  platformStats: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  positive: {
    color: colors.success,
  },
  rankBadge: {
    alignItems: 'center',
    backgroundColor: colors.indigo,
    borderRadius: 8,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  rankText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  savesBar: {
    backgroundColor: colors.warning,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  sharesBar: {
    backgroundColor: colors.success,
  },
  statCard: {
    padding: 6,
    width: '50%',
  },
  statGrowth: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  statIcon: {
    backgroundColor: colors.bgTertiary,
    borderRadius: 8,
    color: colors.indigo,
    fontSize: 20,
    height: 36,
    lineHeight: 36,
    marginBottom: 8,
    overflow: 'hidden',
    textAlign: 'center',
    width: 36,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 24,
    marginHorizontal: -6,
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: 'bold',
  },
  topContentCard: {
    alignItems: 'center',
    backgroundColor: colors.bgTertiary,
    borderRadius: 12,
    flexDirection: 'row',
    marginBottom: 8,
    padding: 14,
  },
  topContentInfo: {
    flex: 1,
    marginLeft: 12,
  },
  topContentMetrics: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  topContentPlatform: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  topContentTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
  },
  topContentViews: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  topContentViewsLabel: {
    color: colors.textMuted,
    fontSize: 11,
  },
});
