import { CreativePatternsModule } from '@api/collections/creative-patterns/creative-patterns.module';
import { PatternMatcherService } from '@api/services/pattern-matcher/pattern-matcher.service';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [PatternMatcherService],
  imports: [forwardRef(() => CreativePatternsModule)],
  providers: [PatternMatcherService],
})
export class PatternMatcherModule {}
