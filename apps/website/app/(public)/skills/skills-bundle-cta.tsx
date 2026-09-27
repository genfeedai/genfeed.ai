import {
  NeuralGrid,
  NeuralGridItem,
  WebSection,
} from '@web-components/content/NeuralGrid';
import { ArrowRight, Sparkles } from 'lucide-react';

import SkillsCheckoutButton from './skills-checkout-button';

type SkillsBundleCtaProps = {
  bundlePrice: number | string;
};

export default function SkillsBundleCta({
  bundlePrice,
}: SkillsBundleCtaProps): React.ReactElement {
  return (
    <WebSection bg="subtle" className="gsap-section">
      <NeuralGrid columns={1}>
        <NeuralGridItem
          padding="lg"
          align="center"
          className="bg-[var(--gen-accent-bg)]"
        >
          <div className="max-w-2xl mx-auto py-8">
            <div className="text-surface/50 text-xs font-black uppercase tracking-widest mb-6">
              All Pro Skills Included
            </div>
            <h2 className="text-5xl font-semibold text-surface mb-4">
              Get Pro Skills
            </h2>
            <div className="text-6xl font-semibold text-surface mb-8">
              ${bundlePrice}
            </div>
            <SkillsCheckoutButton className="min-w-skill-col">
              <Sparkles className="size-4" />
              Buy Bundle
              <ArrowRight className="size-4" />
            </SkillsCheckoutButton>
          </div>
        </NeuralGridItem>
      </NeuralGrid>
    </WebSection>
  );
}
