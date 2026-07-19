import type { IDesktopAnalytics } from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { DesktopResilienceState } from '@renderer/components/DesktopResilienceState';
import { Button } from '@ui/primitives/button';
import { useCallback, useEffect, useReducer } from 'react';

type DaysRange = 7 | 30 | 90;

interface AnalyticsViewProps {
  hasCloudSession: boolean;
  isOnline: boolean;
  workspaceId: string | null;
}

interface DraftStats {
  generatedCount: number;
  publishedCount: number;
  reviewCount: number;
}

interface AnalyticsState {
  analytics: IDesktopAnalytics | null;
  draftStats: DraftStats;
  isLoading: boolean;
  error: string | null;
  days: DaysRange;
}

type AnalyticsAction =
  | { type: 'FETCH_START' }
  | {
      type: 'FETCH_SUCCESS';
      analytics: IDesktopAnalytics | null;
      draftStats: DraftStats;
    }
  | { type: 'FETCH_ERROR'; error: string }
  | { type: 'SET_DAYS'; days: DaysRange };

const initialAnalyticsState: AnalyticsState = {
  analytics: null,
  draftStats: { generatedCount: 0, publishedCount: 0, reviewCount: 0 },
  isLoading: true,
  error: null,
  days: 7,
};

function analyticsReducer(
  state: AnalyticsState,
  action: AnalyticsAction,
): AnalyticsState {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, isLoading: true, error: null };
    case 'FETCH_SUCCESS':
      return {
        ...state,
        isLoading: false,
        analytics: action.analytics,
        draftStats: action.draftStats,
      };
    case 'FETCH_ERROR':
      return { ...state, isLoading: false, error: action.error };
    case 'SET_DAYS':
      return { ...state, days: action.days };
    default:
      return state;
  }
}

export const AnalyticsView = ({
  hasCloudSession,
  isOnline,
  workspaceId,
}: AnalyticsViewProps) => {
  const [state, dispatch] = useReducer(analyticsReducer, initialAnalyticsState);
  const hasDataAccess = isOnline || !hasCloudSession;
  const { analytics, draftStats, isLoading, error, days } = state;

  const loadAnalytics = useCallback(async () => {
    dispatch({ type: 'FETCH_START' });

    try {
      const drafts = workspaceId
        ? await window.genfeedDesktop.drafts.list(workspaceId)
        : [];

      const draftStats: DraftStats = {
        generatedCount: drafts.filter((draft) => draft.status === 'generated')
          .length,
        publishedCount: drafts.filter((draft) => draft.status === 'published')
          .length,
        reviewCount: drafts.filter((draft) => draft.publishIntent === 'review')
          .length,
      };

      if (!hasDataAccess) {
        dispatch({ type: 'FETCH_SUCCESS', analytics: null, draftStats });
        return;
      }

      const result = await window.genfeedDesktop.cloud.getAnalytics({ days });
      dispatch({ type: 'FETCH_SUCCESS', analytics: result, draftStats });
    } catch (err) {
      dispatch({
        type: 'FETCH_ERROR',
        error: err instanceof Error ? err.message : 'Failed to load analytics',
      });
    }
  }, [days, hasDataAccess, workspaceId]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  return (
    <div className="view-analytics">
      <div className="view-header">
        <h2>Analytics</h2>
        <div className="pill-group">
          {([7, 30, 90] as const).map((d) => (
            <Button
              className={`pill-button ${days === d ? 'pill-active' : ''}`}
              key={d}
              onClick={() => dispatch({ type: 'SET_DAYS', days: d })}
              type="button"
              variant={ButtonVariant.UNSTYLED}
            >
              {d}d
            </Button>
          ))}
        </div>
      </div>

      {isLoading && <p className="muted-text">Loading analytics...</p>}
      {!isLoading && !hasDataAccess && (
        <>
          <DesktopResilienceState
            actionLabel="Retry"
            details="Cloud analytics are unavailable while the desktop app is offline. Local content-run counts are still shown below."
            kind="offline"
            onAction={() => void loadAnalytics()}
            title="Analytics are offline"
          />
          <DesktopDraftStatsGrid draftStats={draftStats} />
        </>
      )}
      {!isLoading && hasDataAccess && error && (
        <DesktopResilienceState
          actionLabel="Retry"
          details={error}
          kind="error"
          onAction={() => void loadAnalytics()}
          title="Unable to load analytics"
        />
      )}

      {!isLoading && hasDataAccess && !error && analytics && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-value">{analytics.totalPosts}</span>
              <span className="stat-label">Total Posts</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">
                {analytics.totalViews.toLocaleString()}
              </span>
              <span className="stat-label">Total Views</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">
                {analytics.totalEngagements.toLocaleString()}
              </span>
              <span className="stat-label">Engagements</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{analytics.topPlatform}</span>
              <span className="stat-label">Top Platform</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{draftStats.generatedCount}</span>
              <span className="stat-label">Generated Runs</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{draftStats.publishedCount}</span>
              <span className="stat-label">Published Runs</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{draftStats.reviewCount}</span>
              <span className="stat-label">Review Queue</span>
            </div>
          </div>

          {analytics.recentPosts.length > 0 && (
            <section className="panel-card" style={{ marginTop: 20 }}>
              <h3>Recent Posts</h3>
              <div className="stack-list">
                {analytics.recentPosts.map((post) => (
                  <div className="recent-post-row" key={post.id}>
                    <span className="platform-badge">{post.platform}</span>
                    <span className="recent-post-content">{post.content}</span>
                    <span className="recent-post-views">
                      {post.views.toLocaleString()} views
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {!isLoading && isOnline && !error && !analytics && (
        <DesktopResilienceState
          details="No cloud analytics are available yet. Publish content or sync recent posts, then refresh this view."
          kind="empty"
          title="No analytics yet"
        />
      )}
    </div>
  );
};

function DesktopDraftStatsGrid({
  draftStats,
}: {
  draftStats: {
    generatedCount: number;
    publishedCount: number;
    reviewCount: number;
  };
}) {
  return (
    <div className="stats-grid desktop-local-stats">
      <div className="stat-card">
        <span className="stat-value">{draftStats.generatedCount}</span>
        <span className="stat-label">Generated Runs</span>
      </div>
      <div className="stat-card">
        <span className="stat-value">{draftStats.publishedCount}</span>
        <span className="stat-label">Published Runs</span>
      </div>
      <div className="stat-card">
        <span className="stat-value">{draftStats.reviewCount}</span>
        <span className="stat-label">Review Queue</span>
      </div>
    </div>
  );
}
