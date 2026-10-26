vi.mock('@workers/queues/queues.module', () => ({
  WorkersQueuesModule: class WorkersQueuesModule {},
}));

import { CronIngredientsModule } from '@workers/crons/ingredients/cron.ingredients.module';

describe('CronIngredientsModule', () => {
  it('should be defined', () => {
    expect(CronIngredientsModule).toBeDefined();
  });
});
