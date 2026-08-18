import { CreativePatternsModule } from '@api/collections/creative-patterns/creative-patterns.module';
import { PatternMatcherService } from '@api/services/pattern-matcher/pattern-matcher.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [PatternMatcherService],
  imports: [CreativePatternsModule],
  providers: [PatternMatcherService],
})
export class PatternMatcherModule {}
