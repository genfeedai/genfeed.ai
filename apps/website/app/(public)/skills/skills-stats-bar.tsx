'use client';

import { STATS } from '@public/skills/_data';
import { WebSection } from '@web-components/content/NeuralGrid';

export default function SkillsStatsBar(): React.ReactElement {
  return (
    <WebSection py="md" maxWidth="lg">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8 gsap-hero">
        {STATS.map((stat) => (
          <div key={stat.label} className="text-center">
            <div className="text-4xl font-serif mb-1">{stat.value}</div>
            <div className="text-xs font-black uppercase tracking-widest text-surface/30">
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </WebSection>
  );
}
