import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { requireAuth } from '@/api/client.js';
import {
  getContentGaps,
  getForecast,
  getGrowthPrediction,
  getInsights,
  getPostingTimes,
  getViralAnalysis,
} from '@/api/insights.js';
import { formatHeader, formatLabel, print, printJson } from '@/ui/theme.js';
import { handleError } from '@/utils/errors.js';

export const insightsCommand = new Command('insights')
  .description('AI-powered content insights')
  .option('-l, --limit <n>', 'Max insights', Number.parseInt, 5)
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const spinner = ora('Fetching insights...').start();
      const insights = await getInsights(options.limit);
      spinner.stop();

      if (insights.length === 0) {
        print(chalk.dim('No insights available.'));
        return;
      }

      if (options.json) {
        printJson(insights);
        return;
      }

      print(formatHeader(`\nInsights (${insights.length}):\n`));

      for (const insight of insights) {
        const category = insight.category ? chalk.blue(`[${insight.category}]`) : '';
        const score = insight.score !== undefined ? chalk.dim(`(${insight.score}/100)`) : '';
        print(`  ${chalk.cyan(insight.title ?? insight.id)} ${category} ${score}`);
        if (insight.description) {
          print(`  ${chalk.dim(insight.description)}`);
        }
        print();
      }
    } catch (error) {
      handleError(error);
    }
  });

insightsCommand
  .command('forecast')
  .description('Forecast content performance for a topic')
  .requiredOption('--topic <topic>', 'Topic to forecast')
  .option('--platform <platform>', 'Target platform')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const spinner = ora('Generating forecast...').start();
      const forecast = await getForecast(options.topic, options.platform);
      spinner.stop();

      if (options.json) {
        printJson(forecast);
        return;
      }

      print(formatHeader('\nForecast:\n'));
      print(formatLabel('Topic', forecast.topic));
      if (forecast.platform) {
        print(formatLabel('Platform', forecast.platform));
      }
      if (forecast.prediction) {
        print(formatLabel('Prediction', forecast.prediction));
      }
      if (forecast.confidence !== undefined) {
        print(formatLabel('Confidence', `${Math.round(forecast.confidence * 100)}%`));
      }
      if (forecast.trendDirection) {
        print(formatLabel('Trend', forecast.trendDirection));
      }
    } catch (error) {
      handleError(error);
    }
  });

insightsCommand
  .command('viral')
  .description('Analyze content for viral potential')
  .requiredOption('--content <text>', 'Content to analyze')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const spinner = ora('Analyzing viral potential...').start();
      const analysis = await getViralAnalysis(options.content);
      spinner.stop();

      if (options.json) {
        printJson(analysis);
        return;
      }

      print(formatHeader('\nViral Analysis:\n'));
      print(formatLabel('Score', `${analysis.score}/100`));

      if (analysis.factors?.length) {
        print();
        print(formatHeader('Factors:\n'));
        for (const factor of analysis.factors) {
          print(`  ${chalk.dim('*')} ${factor}`);
        }
      }

      if (analysis.suggestions?.length) {
        print();
        print(formatHeader('Suggestions:\n'));
        for (const suggestion of analysis.suggestions) {
          print(`  ${chalk.dim('*')} ${suggestion}`);
        }
      }
    } catch (error) {
      handleError(error);
    }
  });

insightsCommand
  .command('gaps')
  .description('Identify content gaps')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const spinner = ora('Identifying content gaps...').start();
      const gaps = await getContentGaps();
      spinner.stop();

      if (gaps.length === 0) {
        print(chalk.dim('No content gaps identified.'));
        return;
      }

      if (options.json) {
        printJson(gaps);
        return;
      }

      print(formatHeader(`\nContent Gaps (${gaps.length}):\n`));

      for (const gap of gaps) {
        print(`  ${chalk.cyan(gap.topic)}`);
        if (gap.opportunity) {
          print(`  ${chalk.dim(`Opportunity: ${gap.opportunity}`)}`);
        }
        if (gap.competition) {
          print(`  ${chalk.dim(`Competition: ${gap.competition}`)}`);
        }
        print();
      }
    } catch (error) {
      handleError(error);
    }
  });

insightsCommand
  .command('times')
  .description('Get best posting times')
  .option('--platform <platform>', 'Platform', 'instagram')
  .option('--timezone <tz>', 'Timezone', 'UTC')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const spinner = ora('Fetching best posting times...').start();
      const times = await getPostingTimes(options.platform, options.timezone);
      spinner.stop();

      if (times.length === 0) {
        print(chalk.dim('No posting time data available.'));
        return;
      }

      if (options.json) {
        printJson(times);
        return;
      }

      print(formatHeader(`\nBest Posting Times (${options.platform}):\n`));

      for (const t of times) {
        const bar = chalk.green('|'.repeat(Math.round(t.score / 5)));
        print(
          `  ${chalk.dim(t.day.padEnd(10))} ${String(t.hour).padStart(2, '0')}:00  ${bar} ${chalk.dim(`(${t.score})`)}`
        );
      }
    } catch (error) {
      handleError(error);
    }
  });

insightsCommand
  .command('growth')
  .description('Get growth prediction')
  .option('--platform <platform>', 'Platform', 'instagram')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const spinner = ora('Generating growth prediction...').start();
      const prediction = await getGrowthPrediction(options.platform);
      spinner.stop();

      if (options.json) {
        printJson(prediction);
        return;
      }

      print(formatHeader('\nGrowth Prediction:\n'));
      print(formatLabel('Platform', prediction.platform));
      if (prediction.currentFollowers !== undefined) {
        print(formatLabel('Current Followers', String(prediction.currentFollowers)));
      }
      if (prediction.predictedGrowth !== undefined) {
        print(formatLabel('Predicted Growth', `+${prediction.predictedGrowth}`));
      }
      if (prediction.timeframe) {
        print(formatLabel('Timeframe', prediction.timeframe));
      }

      if (prediction.suggestions?.length) {
        print();
        print(formatHeader('Suggestions:\n'));
        for (const suggestion of prediction.suggestions) {
          print(`  ${chalk.dim('*')} ${suggestion}`);
        }
      }
    } catch (error) {
      handleError(error);
    }
  });
