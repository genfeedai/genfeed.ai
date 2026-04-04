import Card from '@ui/card/Card';
import {
  HiOutlineCalendar,
  HiOutlineChartBar,
  HiOutlineGlobeAlt,
  HiOutlineSparkles,
  HiOutlineSwatch,
  HiOutlineVideoCamera,
} from 'react-icons/hi2';

export default function ContentFeatures() {
  const features = [
    {
      description:
        'Launch and control networks of brand-owned profiles automatically.',
      icon: <HiOutlineGlobeAlt />,
      label: 'Satellite Account Manager',
    },
    {
      description:
        'Generate AI personalities that engage your audience at scale.',
      icon: <HiOutlineSparkles />,
      label: 'Virtual Influencers',
    },
    {
      description: 'From script to post, every step handled by AI.',
      icon: <HiOutlineVideoCamera />,
      label: 'Automated Content Pipeline',
    },
    {
      description:
        'Measure performance across all accounts in a single dashboard.',
      icon: <HiOutlineChartBar />,
      label: 'Unified Analytics',
    },
    {
      description: 'Plan posts for every profile with one click.',
      icon: <HiOutlineCalendar />,
      label: 'Centralized Scheduling',
    },
    {
      description: 'Keep messaging consistent with built-in compliance checks.',
      icon: <HiOutlineSwatch />,
      label: 'Brand Controls',
    },
  ];

  return (
    <>
      {features.map((feature) => (
        <Card key={feature.label}>
          <div className="flex items-center justify-center mb-4 text-4xl">
            {feature.icon}
          </div>

          <h3 className="text-xl font-bold text-center mb-2">
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
