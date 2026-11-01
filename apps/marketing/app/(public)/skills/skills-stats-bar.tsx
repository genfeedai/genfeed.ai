import { STATS } from '@public/skills/_data';
import MetricCard from '@ui/cards/metric-card/MetricCard';
import { MetricCardGrid } from '@ui/cards/metric-card/MetricCardGrid';
import { WebSection } from '@web-components/content/NeuralGrid';

export default function SkillsStatsBar(): React.ReactElement {
  return (
    <WebSection py="md" maxWidth="lg">
      <MetricCardGrid className="gsap-hero" columns={4}>
        {STATS.map((stat) => (
          <MetricCard
            align="center"
            appearance="inset"
            key={stat.label}
            label={stat.label}
            size="lg"
            value={stat.value}
          />
        ))}
      </MetricCardGrid>
    </WebSection>
  );
}
