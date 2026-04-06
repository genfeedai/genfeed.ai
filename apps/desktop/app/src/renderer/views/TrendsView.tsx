import type { IDesktopTrend } from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { useCallback, useEffect, useState } from 'react';

const PLATFORMS = ['tiktok', 'twitter', 'instagram', 'linkedin'] as const;

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  twitter: 'Twitter',
};

interface TrendsViewProps {
  onGenerateFromTrend: (trend: {
    id: string;
    platform: 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'youtube';
    topic: string;
  }) => void;
}

export const TrendsView = ({ onGenerateFromTrend }: TrendsViewProps) => {
  const [trends, setTrends] = useState<IDesktopTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string>('twitter');

  const loadTrends = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await window.genfeedDesktop.cloud.getTrends(platform);
      setTrends(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trends');
    } finally {
      setLoading(false);
    }
  }, [platform]);

  useEffect(() => {
    void loadTrends();
  }, [loadTrends]);

  return (
    <div className="view-trends">
      <div className="view-header">
        <h2>Trends</h2>
        <span className="muted-text">
          Discover what's trending on each platform
        </span>
      </div>

      <div className="pill-group" style={{ marginBottom: 20 }}>
        {PLATFORMS.map((p) => (
          <Button
            className={`pill-button ${platform === p ? 'pill-active' : ''}`}
            key={p}
            onClick={() => setPlatform(p)}
            type="button"
            variant={ButtonVariant.UNSTYLED}
          >
            {PLATFORM_LABELS[p]}
          </Button>
        ))}
      </div>

      {loading && <p className="muted-text">Loading trends...</p>}
      {error && <div className="error-banner">{error}</div>}

      {!loading && !error && trends.length === 0 && (
        <p className="empty-state">
          No trends found for {PLATFORM_LABELS[platform]}.
        </p>
      )}

      {!loading && trends.length > 0 && (
        <div className="trends-list">
          {trends.map((trend) => (
            <div className="trend-card panel-card" key={trend.id}>
              <div className="trend-card-header">
                <strong className="trend-topic">{trend.topic}</strong>
                <span className="platform-badge">{trend.platform}</span>
              </div>
              {trend.summary && (
                <p className="trend-summary muted-text">{trend.summary}</p>
              )}
              <div className="trend-scores">
                <div className="score-bar">
                  <span className="score-label">Virality</span>
                  <div className="score-track">
                    <div
                      className="score-fill virality"
                      style={{
                        width: `${Math.min(trend.viralityScore, 100)}%`,
                      }}
                    />
                  </div>
                  <span className="score-value">{trend.viralityScore}</span>
                </div>
                <div className="score-bar">
                  <span className="score-label">Engagement</span>
                  <div className="score-track">
                    <div
                      className="score-fill engagement"
                      style={{
                        width: `${Math.min(trend.engagementScore, 100)}%`,
                      }}
                    />
                  </div>
                  <span className="score-value">{trend.engagementScore}</span>
                </div>
              </div>
              <Button
                className="small"
                onClick={() =>
                  onGenerateFromTrend({
                    id: trend.id,
                    platform: trend.platform as
                      | 'instagram'
                      | 'linkedin'
                      | 'twitter'
                      | 'tiktok'
                      | 'youtube',
                    topic: trend.topic,
                  })
                }
                type="button"
                variant={ButtonVariant.GHOST}
              >
                ✨ Generate from trend
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
