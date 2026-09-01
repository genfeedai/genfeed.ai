export interface StatItemProps {
  end: number;
  suffix: string;
  label: string;
  index: number;
}

export interface DemoCardProps {
  title: string;
  description: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  platform?: string;
}

export interface OutputFormat {
  description: string;
  title: string;
}

export interface HowStep {
  description: string;
  step: string;
  title: string;
}
