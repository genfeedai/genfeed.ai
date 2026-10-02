import { BrandValidationService } from '@api/services/brand-validation/brand-validation.service';
import { Module } from '@nestjs/common';

@Module({
  providers: [BrandValidationService],
  exports: [BrandValidationService],
})
export class BrandValidationModule {}
