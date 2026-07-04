'use client';

import { HOW_IT_WORKS } from '@public/skills/_data';
import {
  NeuralGrid,
  NeuralGridItem,
  WebSection,
} from '@web-components/content/NeuralGrid';

export default function SkillsHowItWorks(): React.ReactElement {
  return (
    <WebSection maxWidth="lg" bg="bordered" className="gsap-section">
      <div className="text-center mb-16">
        <div className="text-surface/20 text-xs font-black uppercase tracking-widest mb-6">
          How It Works
        </div>
        <h2 className="text-5xl font-semibold mb-6">Install. Learn. Create.</h2>
        <p className="text-surface/50 max-w-xl mx-auto">
          Skills are knowledge packages your agent absorbs, not plugins you
          configure.
        </p>
      </div>

      <NeuralGrid columns={4} className="gsap-grid">
        {HOW_IT_WORKS.map((step) => (
          <NeuralGridItem
            key={step.number}
            className="gsap-card"
            tierLabel={`${step.number} / ${step.title}`}
            icon={step.icon}
            title={step.title}
            description={step.description}
          />
        ))}
      </NeuralGrid>
    </WebSection>
  );
}
