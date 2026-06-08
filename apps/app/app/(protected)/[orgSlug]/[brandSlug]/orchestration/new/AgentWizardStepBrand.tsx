'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { HiArrowLeft, HiArrowRight } from 'react-icons/hi2';

type BrandOption = {
  id: string;
  label: string;
};

type Props = {
  brands: BrandOption[];
  selectedBrandId: string;
  onBrandSelect: (brandId: string) => void;
  onBack: () => void;
  onNext: () => void;
};

export default function AgentWizardStepBrand({
  brands,
  selectedBrandId,
  onBrandSelect,
  onBack,
  onNext,
}: Props) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-foreground/60">
        Choose a brand to auto-fill voice, strategy, and model defaults
      </p>

      {brands.length > 0 ? (
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            Brand (optional)
          </span>
          <Select value={selectedBrandId} onValueChange={onBrandSelect}>
            <SelectTrigger>
              <SelectValue placeholder="No brand selected" />
            </SelectTrigger>
            <SelectContent>
              {brands.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <p className="text-xs text-foreground/50">
          No brands found. You can continue and configure manually.
        </p>
      )}

      <div className="flex justify-between pt-2">
        <Button
          label={
            <>
              <HiArrowLeft /> Back
            </>
          }
          variant={ButtonVariant.SECONDARY}
          onClick={onBack}
        />
        <Button
          label={
            <>
              Configure <HiArrowRight />
            </>
          }
          variant={ButtonVariant.DEFAULT}
          onClick={onNext}
        />
      </div>
    </div>
  );
}
