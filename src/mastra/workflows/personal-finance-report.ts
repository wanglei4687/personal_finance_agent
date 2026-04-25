import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { buildFinancePeriodReportPrompt } from '../../prompts/personal-finance';
import { formatCurrency } from '../../utils/finance';
import {
  buildFinanceReportSummary,
  resolveFinanceReportPeriod,
  type FinanceReportSummary,
} from '../airtable/finance-reporting';

const reportRequestSchema = z
  .object({
    periodType: z.enum(['month', 'quarter', 'year']),
    year: z.number().int().min(2025).max(2100),
    month: z.number().int().min(1).max(12).optional(),
    quarter: z.number().int().min(1).max(4).optional(),
    outputDir: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.periodType === 'month' && value.month === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'month is required when periodType is month',
        path: ['month'],
      });
    }

    if (value.periodType === 'quarter' && value.quarter === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'quarter is required when periodType is quarter',
        path: ['quarter'],
      });
    }
  });

const groupedAmountSchema = z.object({
  name: z.string(),
  amount: z.number(),
});

const budgetComparisonSchema = z.object({
  name: z.string(),
  budgetAmount: z.number(),
  actualAmount: z.number(),
  variance: z.number(),
});

const balanceLineSchema = z.object({
  name: z.string(),
  amount: z.number(),
});

const metricChangeSchema = z.object({
  current: z.number().nullable(),
  previous: z.number().nullable(),
  delta: z.number().nullable(),
  deltaRate: z.number().nullable(),
});

const trendPointSchema = z.object({
  label: z.string(),
  amount: z.number(),
  ratio: z.number().nullable(),
});

const assetAnalysisSchema = z.object({
  snapshotQuarter: z.number().int().min(1).max(4),
  assetsTotal: z.number(),
  liabilitiesTotal: z.number(),
  netWorth: z.number(),
  debtToAssetRatio: z.number().nullable(),
  housingAssetRatio: z.number().nullable(),
  liquidAssetRatio: z.number().nullable(),
  investmentAssetRatio: z.number().nullable(),
  assets: z.array(balanceLineSchema),
  liabilities: z.array(balanceLineSchema),
});

const previousComparisonSchema = z.object({
  available: z.boolean(),
  previousPeriodLabel: z.string().nullable(),
  reason: z.string().optional(),
  incomeTotal: metricChangeSchema,
  expenseTotal: metricChangeSchema,
  netCashFlow: metricChangeSchema,
  savingsRatio: metricChangeSchema,
  costRatio: metricChangeSchema,
  netWorth: metricChangeSchema,
});

const financeReportSummarySchema = z.object({
  title: z.string(),
  periodLabel: z.string(),
  periodType: z.enum(['month', 'quarter', 'year']),
  year: z.number().int(),
  startDate: z.string(),
  endDate: z.string(),
  dataThrough: z.string(),
  coveredMonths: z.number().int().min(1),
  transactionCount: z.number().int().min(0),
  incomeTotal: z.number(),
  expenseTotal: z.number(),
  netCashFlow: z.number(),
  savingsRatio: z.number().nullable(),
  costRatio: z.number().nullable(),
  averageMonthlyIncome: z.number(),
  averageMonthlyExpense: z.number(),
  averageMonthlyNetCashFlow: z.number(),
  budgetTotal: z.number(),
  budgetVariance: z.number(),
  budgetUtilization: z.number().nullable(),
  topIncomeGroups: z.array(groupedAmountSchema),
  topExpenseGroups: z.array(groupedAmountSchema),
  topCostTransactions: z.array(groupedAmountSchema),
  budgetComparisons: z.array(budgetComparisonSchema),
  assetAnalysis: assetAnalysisSchema.nullable(),
  previousComparison: previousComparisonSchema,
  costTrend: z.array(trendPointSchema),
  savingsTrend: z.array(trendPointSchema),
  largestIncomeTransaction: groupedAmountSchema.nullable(),
  largestExpenseTransaction: groupedAmountSchema.nullable(),
});

const reportArtifactSchema = z.object({
  title: z.string(),
  periodLabel: z.string(),
  outputDir: z.string(),
  fileName: z.string(),
  markdown: z.string(),
  summary: financeReportSummarySchema,
});

const workflowOutputSchema = z.object({
  filePath: z.string(),
  title: z.string(),
  periodLabel: z.string(),
  markdown: z.string(),
  summary: financeReportSummarySchema,
});

const loadFinanceReportData = createStep({
  id: 'load-finance-report-data',
  description: 'Loads finance data from Airtable and builds the reporting summary',
  inputSchema: reportRequestSchema,
  outputSchema: z.object({
    title: z.string(),
    periodLabel: z.string(),
    outputDir: z.string(),
    fileName: z.string(),
    summary: financeReportSummarySchema,
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Report request not found');
    }

    const period = resolveFinanceReportPeriod(inputData);
    const summary = await buildFinanceReportSummary(period);

    return {
      title: summary.title,
      periodLabel: summary.periodLabel,
      outputDir: period.outputDir,
      fileName: period.fileName,
      summary,
    };
  },
});

const generateFinanceReport = createStep({
  id: 'generate-finance-report',
  description: 'Generates a markdown finance report from the Airtable summary',
  inputSchema: z.object({
    title: z.string(),
    periodLabel: z.string(),
    outputDir: z.string(),
    fileName: z.string(),
    summary: financeReportSummarySchema,
  }),
  outputSchema: reportArtifactSchema,
  execute: async ({ inputData, mastra }) => {
    if (!inputData) {
      throw new Error('Finance summary not found');
    }

    const reportMarkdown = await generateMarkdownReport(
      inputData.summary,
      mastra?.getAgent('personal-finance-agent'),
    );

    return {
      ...inputData,
      markdown: reportMarkdown,
    };
  },
});

const writeFinanceReportToFile = createStep({
  id: 'write-finance-report-to-file',
  description: 'Writes the markdown report to the local finance report directory',
  inputSchema: reportArtifactSchema,
  outputSchema: workflowOutputSchema,
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Report artifact not found');
    }

    await mkdir(inputData.outputDir, { recursive: true });
    const filePath = path.join(inputData.outputDir, inputData.fileName);
    await writeFile(filePath, `${inputData.markdown.trim()}\n`, 'utf8');

    return {
      filePath,
      title: inputData.title,
      periodLabel: inputData.periodLabel,
      markdown: inputData.markdown,
      summary: inputData.summary,
    };
  },
});

const financialCheckInWorkflow = createWorkflow({
  id: 'financial-check-in-workflow',
  inputSchema: reportRequestSchema,
  outputSchema: workflowOutputSchema,
})
  .then(loadFinanceReportData)
  .then(generateFinanceReport)
  .then(writeFinanceReportToFile);

financialCheckInWorkflow.commit();

export { financialCheckInWorkflow };

async function generateMarkdownReport(
  summary: FinanceReportSummary,
  agent: { generate: (messages: Array<{ role: 'user'; content: string }>) => Promise<{ text: string }> } | undefined,
): Promise<string> {
  const prompt = buildFinancePeriodReportPrompt(summary);

  if (agent) {
    try {
      const result = await agent.generate([
        {
          role: 'user',
          content: prompt,
        },
      ]);

      if (result.text.trim()) {
        return normalizeReportCurrency(result.text.trim());
      }
    } catch (error) {
      console.warn('Failed to generate narrative report with agent, using fallback template.', error);
    }
  }

  return renderFallbackFinanceReport(summary);
}

function renderFallbackFinanceReport(summary: FinanceReportSummary): string {
  const includeBalanceSheetAnalysis = shouldIncludeBalanceSheetAnalysis(summary);
  const lines = [
    `# ${summary.title}`,
    '',
    `Data range: ${summary.startDate} to ${summary.dataThrough}`,
    `Reporting period: ${summary.periodLabel}`,
    `Transactions: ${summary.transactionCount}`,
    '',
    buildHeadline(summary),
    '',
    '## Income And Expense Summary',
    '',
    `- Total income: ${formatCurrency(summary.incomeTotal)}`,
    `- Total expenses: ${formatCurrency(summary.expenseTotal)}`,
    `- Net cash flow: ${formatCurrency(summary.netCashFlow)}`,
    `- Savings rate: ${formatPercentage(summary.savingsRatio)}`,
    `- Cost ratio: ${formatPercentage(summary.costRatio)}`,
    '',
    '## Comparison With Previous Period',
    '',
    ...renderPreviousComparison(summary),
    '',
    '## Spending And Savings Trends',
    '',
    ...renderTrendTable(summary),
    '',
    '## Budget Performance',
    '',
    `- Period budget: ${formatCurrency(summary.budgetTotal)}`,
    `- Budget variance: ${formatCurrency(summary.budgetVariance)}`,
    `- Budget utilization: ${formatPercentage(summary.budgetUtilization)}`,
    '',
    ...renderBudgetTable(summary),
    '',
    '## Key Findings',
    '',
    ...renderFindings(summary),
    '',
    '## Next Actions',
    '',
    ...renderActions(summary),
  ];

  if (includeBalanceSheetAnalysis) {
    lines.splice(
      lines.indexOf('## Key Findings'),
      0,
      '## Asset Analysis',
      '',
      ...renderAssetAnalysis(summary),
      '',
    );
  }

  return lines.join('\n').trim();
}

function buildHeadline(summary: FinanceReportSummary): string {
  const comparison = summary.previousComparison;

  if (summary.netCashFlow < 0) {
    return 'Cash flow is negative in this period, so the immediate priority is restoring a positive monthly surplus.';
  }

  if (comparison.available && comparison.expenseTotal.delta && comparison.expenseTotal.delta > 0) {
    return 'Cash flow remains positive, but expenses increased versus the prior period and budget control needs to tighten.';
  }

  if (summary.savingsRatio !== null && summary.savingsRatio >= 0.3) {
    return 'Savings capacity is strong in this period, so the focus should shift toward asset accumulation and net worth growth.';
  }

  return 'Financial performance is broadly under control; the main focus is keeping spending efficient and savings consistent.';
}

function renderPreviousComparison(summary: FinanceReportSummary): string[] {
  const comparison = summary.previousComparison;

  if (!comparison.available) {
    return [
      `- Previous period label: ${comparison.previousPeriodLabel ?? 'No data available'}`,
      '- Comparison status: unavailable',
      `- Reason: ${comparison.reason ?? 'No data available'}`,
    ];
  }

  const rows = [
    `- Comparison period: ${comparison.previousPeriodLabel}`,
    '| Metric | Current | Previous | Change | Change Rate |',
    '| --- | ---: | ---: | ---: | ---: |',
    buildComparisonRow('Income', comparison.incomeTotal, 'currency'),
    buildComparisonRow('Expenses', comparison.expenseTotal, 'currency'),
    buildComparisonRow('Net cash flow', comparison.netCashFlow, 'currency'),
    buildComparisonRow('Savings rate', comparison.savingsRatio, 'percent'),
    buildComparisonRow('Cost ratio', comparison.costRatio, 'percent'),
  ];

  if (shouldIncludeBalanceSheetAnalysis(summary)) {
    rows.push(buildComparisonRow('Net worth', comparison.netWorth, 'currency'));
  }

  return rows;
}

function buildComparisonRow(
  label: string,
  metric: FinanceReportSummary['previousComparison']['incomeTotal'],
  format: 'currency' | 'percent',
): string {
  return `| ${label} | ${formatMetricValue(metric.current, format)} | ${formatMetricValue(metric.previous, format)} | ${formatMetricValue(metric.delta, format)} | ${formatPercentage(metric.deltaRate)} |`;
}

function renderTrendTable(summary: FinanceReportSummary): string[] {
  if (summary.costTrend.length === 0 || summary.savingsTrend.length === 0) {
    return ['No data available'];
  }

  const rows = [
    '| Period | Expenses | Cost Ratio | Net Savings | Savings Rate |',
    '| --- | ---: | ---: | ---: | ---: |',
  ];

  for (let index = 0; index < Math.min(summary.costTrend.length, summary.savingsTrend.length); index += 1) {
    const costPoint = summary.costTrend[index];
    const savingsPoint = summary.savingsTrend[index];
    rows.push(
      `| ${costPoint.label} | ${formatCurrency(costPoint.amount)} | ${formatPercentage(costPoint.ratio)} | ${formatCurrency(savingsPoint.amount)} | ${formatPercentage(savingsPoint.ratio)} |`,
    );
  }

  return rows;
}

function renderBudgetTable(summary: FinanceReportSummary): string[] {
  if (summary.budgetComparisons.length === 0) {
    return ['No data available'];
  }

  return [
    '| Category | Period Budget | Actual Spending | Variance |',
    '| --- | ---: | ---: | ---: |',
    ...summary.budgetComparisons.slice(0, 8).map((item) => {
      return `| ${item.name} | ${formatCurrency(item.budgetAmount)} | ${formatCurrency(item.actualAmount)} | ${formatCurrency(item.variance)} |`;
    }),
  ];
}

function renderAssetAnalysis(summary: FinanceReportSummary): string[] {
  const assetAnalysis = summary.assetAnalysis;

  if (!assetAnalysis) {
    return ['No data available'];
  }

  return [
    `- Snapshot quarter: Q${assetAnalysis.snapshotQuarter}`,
    `- Total assets: ${formatCurrency(assetAnalysis.assetsTotal)}`,
    `- Total liabilities: ${formatCurrency(assetAnalysis.liabilitiesTotal)}`,
    `- Net worth: ${formatCurrency(assetAnalysis.netWorth)}`,
    `- Debt-to-asset ratio: ${formatPercentage(assetAnalysis.debtToAssetRatio)}`,
    `- Housing asset ratio: ${formatPercentage(assetAnalysis.housingAssetRatio)}`,
    `- Liquid asset ratio: ${formatPercentage(assetAnalysis.liquidAssetRatio)}`,
    `- Investment asset ratio: ${formatPercentage(assetAnalysis.investmentAssetRatio)}`,
    '',
    '| Asset | Amount |',
    '| --- | ---: |',
    ...assetAnalysis.assets.map((item) => `| ${item.name} | ${formatCurrency(item.amount)} |`),
    '',
    '| Liability | Amount |',
    '| --- | ---: |',
    ...assetAnalysis.liabilities.map((item) => `| ${item.name} | ${formatCurrency(item.amount)} |`),
  ];
}

function renderFindings(summary: FinanceReportSummary): string[] {
  const findings: string[] = [];

  if (summary.topExpenseGroups[0]) {
    findings.push(
      `- Spending pressure is concentrated in ${summary.topExpenseGroups[0].name}, totaling ${formatCurrency(summary.topExpenseGroups[0].amount)}.`,
    );
  }

  if (summary.previousComparison.available && summary.previousComparison.expenseTotal.delta) {
    const direction =
      summary.previousComparison.expenseTotal.delta > 0 ? 'increased' : 'decreased';
    findings.push(
      `- Compared with ${summary.previousComparison.previousPeriodLabel}, total expenses ${direction} by ${formatCurrency(Math.abs(summary.previousComparison.expenseTotal.delta))}.`,
    );
  }

  if (summary.savingsRatio !== null) {
    findings.push(
      `- Savings rate is ${formatPercentage(summary.savingsRatio)} and cost ratio is ${formatPercentage(summary.costRatio)}.`,
    );
  }

  if (shouldIncludeBalanceSheetAnalysis(summary) && summary.assetAnalysis) {
    findings.push(
      `- Net worth stands at ${formatCurrency(summary.assetAnalysis.netWorth)} and the balance sheet should be tracked alongside the debt-to-asset ratio of ${formatPercentage(summary.assetAnalysis.debtToAssetRatio)}.`,
    );
  }

  if (findings.length === 0) {
    return ['No data available'];
  }

  return findings;
}

function renderActions(summary: FinanceReportSummary): string[] {
  const actions: string[] = [];
  const worstBudgetItem = [...summary.budgetComparisons].sort(
    (left, right) => left.variance - right.variance,
  )[0];

  if (summary.netCashFlow < 0) {
    actions.push('1. Bring expenses back below income immediately, starting with non-essential spending and deferrable payments.');
  } else if (summary.savingsRatio !== null && summary.savingsRatio < 0.2) {
    actions.push('1. Increase the automatic savings rate so monthly surplus is locked in before discretionary spending expands.');
  } else {
    actions.push('1. Maintain the current surplus rhythm and sweep this period’s excess cash into long-term savings or investment accounts.');
  }

  if (worstBudgetItem) {
    actions.push(
      `2. Review ${worstBudgetItem.name} in detail, set a hard cap for the over-budget portion, and track it weekly.`,
    );
  } else {
    actions.push('2. Improve budget mapping so all major spending categories are tied to a tracked budget line.');
  }

  if (!shouldIncludeBalanceSheetAnalysis(summary)) {
    actions.push('3. Track monthly cash flow against budget and roll any material balance-sheet changes into the next quarterly or yearly review.');
  } else if (
    summary.assetAnalysis &&
    summary.assetAnalysis.debtToAssetRatio !== null &&
    summary.assetAnalysis.debtToAssetRatio > 0.5
  ) {
    actions.push('3. Prioritize liability cleanup by reducing high-cost debt first, then increase the share of liquid and investment assets.');
  } else {
    actions.push('3. Review asset allocation regularly and keep improving the quality of liquid and investment holdings.');
  }

  return actions;
}

function shouldIncludeBalanceSheetAnalysis(summary: FinanceReportSummary): boolean {
  return summary.periodType !== 'month';
}

function normalizeReportCurrency(markdown: string): string {
  return markdown.replace(
    /-\$\d{1,3}(?:,\d{3})*(?:\.\d+)?|\$\d{1,3}(?:,\d{3})*(?:\.\d+)?|-\$\d+(?:\.\d+)?|\$\d+(?:\.\d+)?/g,
    (match) => {
      const isNegative = match.startsWith('-');
      const numericValue = Number(match.replace(/[$,]/g, ''));
      const absoluteValue = Math.abs(numericValue);
      const decimalPart = match.match(/\.(\d+)/)?.[1];

      const formatted = formatCurrency(absoluteValue, {
        maximumFractionDigits: decimalPart?.length ?? 2,
        minimumFractionDigits: decimalPart?.length,
      });

      return isNegative ? `-${formatted}` : formatted;
    },
  );
}

function formatPercentage(value: number | null): string {
  if (value === null) {
    return 'No data available';
  }

  return `${(value * 100).toFixed(1)}%`;
}

function formatMetricValue(
  value: number | null,
  format: 'currency' | 'percent',
): string {
  if (value === null) {
    return 'No data available';
  }

  return format === 'currency' ? formatCurrency(value) : formatPercentage(value);
}
