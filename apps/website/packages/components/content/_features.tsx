import Card from '@ui/card/Card';
import {
  BarChart3,
  Calendar,
  Globe,
  Palette,
  Sparkles,
  Video,
} from 'lucide-react';

const features = [
  {
    description:
      'Launch and control networks of brand-owned profiles automatically.',
    icon: <Globe />,
    label: 'Satellite Account Manager',
  },
  {
    description:
      'Generate AI personalities that engage your audience at scale.',
    icon: <Sparkles />,
    label: 'Virtual Influencers',
  },
  {
    description: 'From script to post, every step handled by AI.',
    icon: <Video />,
    label: 'Automated Content Pipeline',
  },
  {
    description:
      'Measure performance across all accounts in a single dashboard.',
    icon: <BarChart3 />,
    label: 'Unified Analytics',
  },
  {
    description: 'Plan posts for every profile with one click.',
    icon: <Calendar />,
    label: 'Centralized Scheduling',
  },
  {
    description: 'Keep messaging consistent with built-in compliance checks.',
    icon: <Palette />,
    label: 'Brand Controls',
  },
];

export default function ContentFeatures() {
  return (
    <>
      {features.map((feature) => (
        <Card key={feature.label}>
          <div className="flex items-center justify-center mb-4 text-4xl">
            {feature.icon}
          </div>

          <h3 className="text-xl font-semibold text-center mb-2">
            {feature.label}
          </h3>

          <p className="text-muted-foreground text-center">
            {feature.description}
          </p>
        </Card>
      ))}
    </>
  );
}
