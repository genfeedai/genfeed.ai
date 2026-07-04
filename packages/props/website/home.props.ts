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

export interface AudienceBenefit {
  label: string;
}

export interface OutputFormat {
  credits: number;
  description: string;
  /** Sample output asset shown in the format tile (public/images/home/formats) */
  image: string;
  priceSuffix?: string;
  title: string;
}

export interface HowStep {
  description: string;
  step: string;
  title: string;
}

export interface ExampleCampaign {
  caption: string;
  handle: string;
  likes: string;
  status: string;
}
