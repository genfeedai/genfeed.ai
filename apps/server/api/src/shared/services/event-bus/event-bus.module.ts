/**
 * Event Bus Module
 * Global module providing the EventBusService for decoupled communication.
 * Import this module to emit or subscribe to domain events.
 */
import { EventBusService } from '@api/shared/services/event-bus/event-bus.service';
import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Global()
@Module({
  exports: [EventBusService],
  imports: [
    EventEmitterModule.forRoot({
      // Delimiter for nested events (e.g., 'video.created')
      delimiter: '.',
      // Ignore errors thrown by listeners
      ignoreErrors: false,
      // Maximum number of listeners per event
      maxListeners: 20,
      // Enable verbose error logging
      verboseMemoryLeak: true,
      // Use wildcards for event matching
      wildcard: true,
    }),
  ],
  providers: [EventBusService],
})
export class EventBusModule {}
