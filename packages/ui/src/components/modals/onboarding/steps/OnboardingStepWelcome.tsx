'use client';

import { FileText, Globe, Paintbrush, Sparkles } from 'lucide-react';

const features = [
  {
    description: 'Extract your brand colors, logo, and visual identity',
    icon: Paintbrush,
    title: 'Brand Colors & Logo',
  },
  {
    description: 'Understand your messaging and value propositions',
    icon: FileText,
    title: 'Tone of Voice',
  },
  {
    description: 'Identify who your content should speak to',
    icon: Globe,
    title: 'Target Audience',
  },
  {
    description: 'Create AI prompts that match your brand perfectly',
    icon: Sparkles,
    title: 'AI-Ready Prompts',
  },
];

/**
 * Welcome step - explains what the onboarding will do
 */
export default function OnboardingStepWelcome() {
  return (
    <div className="py-6 px-1">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-semibold tracking-tight mb-3">
          Let&apos;s set up your brand
        </h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          We&apos;ll analyze your website to learn about your brand and create
          personalized content from day one.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="group relative flex items-start gap-4 bg-tertiary p-5 shadow-border transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-border-strong"
          >
            <div className="flex-shrink-0 size-12 bg-primary/10 border border-primary/10 group-hover:border-primary/20 transition-colors flex items-center justify-center">
              <feature.icon className="size-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold mb-1.5">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="text-center mt-6">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-tertiary px-4 py-2.5 text-sm text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary animate-pulse" />
          This takes about 30 seconds. You can edit everything after.
        </span>
      </div>
    </div>
  );
}
