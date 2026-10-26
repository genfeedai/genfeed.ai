import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { IngredientsOperationsController } from '@api/collections/ingredients/controllers/ingredients-operations.controller';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MODULE_METADATA } from '@nestjs/common/constants';

// Discover the controller inventory rather than keeping a second registration list.
describe('IngredientsModule controller registration', () => {
  it('registers every ingredients controller exactly once', () => {
    const declared = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      IngredientsModule,
    ) as unknown[];
    const directory = new URL('./controllers/', import.meta.url);
    const controllers = readdirSync(fileURLToPath(directory))
      .filter((file) => file.endsWith('.controller.ts'))
      .flatMap((file) =>
        [
          ...readFileSync(new URL(file, directory), 'utf8').matchAll(
            /export class (\w+Controller)\b/g,
          ),
        ].map((match) => match[1]),
      );
    expect(controllers).toContain(IngredientsOperationsController.name);

    for (const controller of controllers) {
      expect(
        declared.filter(
          (value) => typeof value === 'function' && value.name === controller,
        ),
      ).toHaveLength(1);
    }
  });
});
