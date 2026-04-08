'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { HiOutlineGlobeAlt } from 'react-icons/hi2';

export interface OnboardingStepBrandUrlProps {
  value: string;
  onChange: (value: string) => void;
  isDisabled?: boolean;
}

const exampleUrls = ['apple.com', 'stripe.com', 'notion.so'];

/**
 * Brand URL input step
 */
export default function OnboardingStepBrandUrl({
  value,
  onChange,
  isDisabled = false,
}: OnboardingStepBrandUrlProps) {
  return (
    <div className="py-4">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-semibold mb-2">
          Enter your brand&apos;s website
        </h2>
        <p className="text-muted-foreground">
          We&apos;ll analyze your website to extract brand information
        </p>
      </div>

      <div className="max-w-md mx-auto">
        <FormControl label="Website URL">
          <div className="relative">
            <HiOutlineGlobeAlt className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="url"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://yourcompany.com"
              disabled={isDisabled}
              className="pl-10 pr-4 py-3"
            />
          </div>
        </FormControl>

        <div className="mt-6 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            Examples of what we can analyze:
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {exampleUrls.map((url) => (
              <Button
                key={url}
                type="button"
                onClick={() => onChange(`https://${url}`)}
                isDisabled={isDisabled}
                variant={ButtonVariant.UNSTYLED}
                className="px-3 py-1 text-sm rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                {url}
              </Button>
            ))}
          </div>
        </div>

        <div className="mt-8 p-4 bg-muted/50">
          <h4 className="font-medium mb-2">What we&apos;ll extract:</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Company name and tagline</li>
            <li>• Brand colors from your design</li>
            <li>• Key messaging and value propositions</li>
            <li>• Social media links</li>
            <li>• About/mission text for voice analysis</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
