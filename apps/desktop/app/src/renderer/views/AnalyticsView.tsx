import type { IDesktopAnalytics } from '@genfeedai/desktop-contracts';
import { useCallback, useEffect, useState } from 'react';

type DaysRange = 7 | 30 | 90;

interface AnalyticsViewProps {
  workspaceId: string | null;
}

export const AnalyticsView = ({ workspaceId }: AnalyticsViewProps) => {
  const [analytics, setAnalytics] = useState<IDesktopAnalytics | null>(null);
  const [draftStats, setDraftStats] = useState({
    generatedCount: 0,
    publishedCount: 0,
    reviewCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<DaysRange>(7);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [result, drafts] = await Promise.all([
        window.genfeedDesktop.cloud.getAnalytics({ days }),
        workspaceId
          ? window.genfeedDesktop.drafts.list(workspaceId)
          : Promise.resolve([]),
      ]);
      setAnalytics(result);
      setDraftStats({
        generatedCount: drafts.filter((draft) => draft.status === 'generated')
          .length,
        publishedCount: drafts.filter((draft) => draft.status === 'published')
          .length,
        reviewCount: drafts.filter((draft) => draft.publishIntent === 'review')
          .length,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [days, workspaceId]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  return (
    <div className="view-analytics">
      <div className="view-header">
        <h2>Analytics</h2>
        <div className="pill-group">
          {([7, 30, 90] as const).map((d) => (
            <button
              className={`pill-button ${days === d ? 'pill-active' : ''}`}
              key={d}
              onClick={() => setDays(d)}
              type="button"
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="muted-text">Loading analytics...</p>}
      {error && <div className="error-banner">{error}</div>}

      {!loading && analytics && (
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
    </div>
  );
};
