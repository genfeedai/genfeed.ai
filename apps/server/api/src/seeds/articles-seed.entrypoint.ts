import process from 'node:process';
import { runArticlesSeed } from '@api-scripts/seeds/articles.seed';
import { Logger } from '@nestjs/common';

const logger = new Logger('ArticlesSeedEntrypoint');

void runArticlesSeed()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    logger.error(
      'Articles seed failed',
      error instanceof Error ? error.stack : String(error),
    );
    process.exit(1);
  });
