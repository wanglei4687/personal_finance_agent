import { homedir } from 'node:os';
import { getFinanceAirtableBaseConfig } from './finance-schema';
import { calculateRatio } from '../../utils/finance';

export type FinanceReportPeriodType = 'month' | 'quarter' | 'year';

export type FinanceReportRequest = {
  periodType: FinanceReportPeriodType;
  year: number;
  month?: number;
  quarter?: number;
  outputDir?: string;
};

export type ResolvedFinancePeriod = {
  periodType: FinanceReportPeriodType;
  year: number;
  month?: number;
  quarter?: number;
  startDate: string;
  endDate: string;
  dataThrough: string;
  coveredMonths: number;
  label: string;
  fileName: string;
  snapshotQuarterHint?: number;
  outputDir: string;
};

export type FinanceGroupedAmount = {
  name: string;
  amount: number;
};

export type FinanceBudgetComparison = {
  name: string;
  budgetAmount: number;
  actualAmount: number;
  variance: number;
};

export type FinanceBalanceLine = {
  name: string;
  amount: number;
};

export type FinanceMetricChange = {
  current: number | null;
  previous: number | null;
  delta: number | null;
  deltaRate: number | null;
};

export type FinanceTrendPoint = {
  label: string;
  amount: number;
  ratio: number | null;
};

export type FinanceAssetAnalysis = {
  snapshotQuarter: number;
  assetsTotal: number;
  liabilitiesTotal: number;
  netWorth: number;
  debtToAssetRatio: number | null;
  housingAssetRatio: number | null;
  liquidAssetRatio: number | null;
  investmentAssetRatio: number | null;
  assets: FinanceBalanceLine[];
  liabilities: FinanceBalanceLine[];
};

export type FinancePreviousComparison = {
  available: boolean;
  previousPeriodLabel: string | null;
  reason?: string;
  incomeTotal: FinanceMetricChange;
  expenseTotal: FinanceMetricChange;
  netCashFlow: FinanceMetricChange;
  savingsRatio: FinanceMetricChange;
  costRatio: FinanceMetricChange;
  netWorth: FinanceMetricChange;
};

export type FinanceReportSummary = {
  title: string;
  periodLabel: string;
  periodType: FinanceReportPeriodType;
  year: number;
  startDate: string;
  endDate: string;
  dataThrough: string;
  coveredMonths: number;
  transactionCount: number;
  incomeTotal: number;
  expenseTotal: number;
  netCashFlow: number;
  savingsRatio: number | null;
  costRatio: number | null;
  averageMonthlyIncome: number;
  averageMonthlyExpense: number;
  averageMonthlyNetCashFlow: number;
  budgetTotal: number;
  budgetVariance: number;
  budgetUtilization: number | null;
  topIncomeGroups: FinanceGroupedAmount[];
  topExpenseGroups: FinanceGroupedAmount[];
  topCostTransactions: FinanceGroupedAmount[];
  budgetComparisons: FinanceBudgetComparison[];
  assetAnalysis: FinanceAssetAnalysis | null;
  previousComparison: FinancePreviousComparison;
  costTrend: FinanceTrendPoint[];
  savingsTrend: FinanceTrendPoint[];
  largestIncomeTransaction: FinanceGroupedAmount | null;
  largestExpenseTransaction: FinanceGroupedAmount | null;
};

type AirtableRecord = {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
};

type TransactionRecord = {
  id: string;
  name: string;
  amount: number;
  date?: string;
  categoryIds: string[];
};

type BudgetRecord = {
  name: string;
  annualBudget: number;
  categoryIds: string[];
};

type BalanceRecord = {
  name: string;
  quarterlyValues: Partial<Record<1 | 2 | 3 | 4, number>>;
};

type FinanceYearData = {
  year: number;
  supportsDatedPeriods: boolean;
  transactions: TransactionRecord[];
  budgets: BudgetRecord[];
  assets: BalanceRecord[];
  liabilities: BalanceRecord[];
  categoryNames: Map<string, string>;
  categoryToBudget: Map<string, string[]>;
  categoryToIncomeGroup: Map<string, string[]>;
};

type PeriodAggregate = Omit<
  FinanceReportSummary,
  'title' | 'previousComparison' | 'costTrend' | 'savingsTrend'
>;

const AIRTABLE_API_BASE_URL = 'https://api.airtable.com/v0';
const DEFAULT_REPORT_OUTPUT_DIR =
  process.env.AIRTABLE_FINANCE_REPORT_DIR?.trim() || `${homedir()}/personal/finance`;

export function resolveFinanceReportPeriod(
  request: FinanceReportRequest,
  now: Date = new Date(),
): ResolvedFinancePeriod {
  const year = request.year;
  const outputDir = request.outputDir?.trim() || DEFAULT_REPORT_OUTPUT_DIR;
  const currentDate = formatDate(now);
  let startDate: string;
  let endDate: string;
  let label: string;
  let fileName: string;
  let snapshotQuarterHint: number | undefined;

  if (request.periodType === 'month') {
    if (!request.month) {
      throw new Error('month is required when periodType is "month"');
    }

    startDate = formatDate(new Date(Date.UTC(year, request.month - 1, 1)));
    endDate = formatDate(new Date(Date.UTC(year, request.month, 0)));
    label = `${year}-${String(request.month).padStart(2, '0')}`;
    fileName = `finance-report-${label}.md`;
    snapshotQuarterHint = Math.ceil(request.month / 3);
  } else if (request.periodType === 'quarter') {
    if (!request.quarter) {
      throw new Error('quarter is required when periodType is "quarter"');
    }

    const startMonth = (request.quarter - 1) * 3;
    startDate = formatDate(new Date(Date.UTC(year, startMonth, 1)));
    endDate = formatDate(new Date(Date.UTC(year, startMonth + 3, 0)));
    label = `${year}-Q${request.quarter}`;
    fileName = `finance-report-${year}-q${request.quarter}.md`;
    snapshotQuarterHint = request.quarter;
  } else {
    startDate = formatDate(new Date(Date.UTC(year, 0, 1)));
    endDate = formatDate(new Date(Date.UTC(year, 11, 31)));
    label = year === now.getUTCFullYear() ? `${year}-YTD` : `${year}`;
    fileName = `finance-report-${year}.md`;
  }

  const dataThrough = currentDate < endDate ? currentDate : endDate;

  if (dataThrough < startDate) {
    throw new Error(`The requested period ${label} is entirely in the future.`);
  }

  return {
    periodType: request.periodType,
    year,
    month: request.month,
    quarter: request.quarter,
    startDate,
    endDate,
    dataThrough,
    coveredMonths: monthSpan(startDate, dataThrough),
    label,
    fileName,
    snapshotQuarterHint,
    outputDir,
  };
}

export async function buildFinanceReportSummary(
  period: ResolvedFinancePeriod,
): Promise<FinanceReportSummary> {
  const cache = new Map<number, Promise<FinanceYearData>>();
  const current = await summarizePeriod(period, cache);
  const previousComparison = await buildPreviousComparison(period, current, cache);
  const trendAggregates = await buildTrendAggregates(period, cache);

  return {
    title: buildReportTitle(period),
    ...current,
    previousComparison,
    costTrend: trendAggregates.map((item) => ({
      label: item.periodLabel,
      amount: item.expenseTotal,
      ratio: item.costRatio,
    })),
    savingsTrend: trendAggregates.map((item) => ({
      label: item.periodLabel,
      amount: item.netCashFlow,
      ratio: item.savingsRatio,
    })),
  };
}

async function buildPreviousComparison(
  period: ResolvedFinancePeriod,
  current: PeriodAggregate,
  cache: Map<number, Promise<FinanceYearData>>,
): Promise<FinancePreviousComparison> {
  const previousPeriod = resolvePreviousPeriod(period);

  try {
    const previous = await summarizePeriod(previousPeriod, cache);

    return {
      available: true,
      previousPeriodLabel: previous.periodLabel,
      incomeTotal: buildMetricChange(current.incomeTotal, previous.incomeTotal),
      expenseTotal: buildMetricChange(current.expenseTotal, previous.expenseTotal),
      netCashFlow: buildMetricChange(current.netCashFlow, previous.netCashFlow),
      savingsRatio: buildMetricChange(current.savingsRatio, previous.savingsRatio),
      costRatio: buildMetricChange(current.costRatio, previous.costRatio),
      netWorth: buildMetricChange(
        current.assetAnalysis?.netWorth ?? null,
        previous.assetAnalysis?.netWorth ?? null,
      ),
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    return {
      available: false,
      previousPeriodLabel: previousPeriod.label,
      reason,
      incomeTotal: buildMetricChange(current.incomeTotal, null),
      expenseTotal: buildMetricChange(current.expenseTotal, null),
      netCashFlow: buildMetricChange(current.netCashFlow, null),
      savingsRatio: buildMetricChange(current.savingsRatio, null),
      costRatio: buildMetricChange(current.costRatio, null),
      netWorth: buildMetricChange(current.assetAnalysis?.netWorth ?? null, null),
    };
  }
}

async function buildTrendAggregates(
  period: ResolvedFinancePeriod,
  cache: Map<number, Promise<FinanceYearData>>,
): Promise<PeriodAggregate[]> {
  const requests = buildTrendRequests(period);
  const results = await Promise.all(
    requests.map(async (request) => {
      try {
        return await summarizePeriod(request, cache);
      } catch {
        return null;
      }
    }),
  );

  return results.filter((item): item is PeriodAggregate => item !== null);
}

async function summarizePeriod(
  period: ResolvedFinancePeriod,
  cache: Map<number, Promise<FinanceYearData>>,
): Promise<PeriodAggregate> {
  const yearData = await loadFinanceYearData(period.year, cache);

  if (!yearData.supportsDatedPeriods && period.periodType !== 'year') {
    throw new Error(
      `Airtable base ${period.year} does not expose a transaction date field. Only yearly reports are supported for this base.`,
    );
  }

  const filteredTransactions = yearData.transactions.filter((transaction) => {
    if (!transaction.date) {
      return true;
    }

    return (
      transaction.date >= period.startDate && transaction.date <= period.dataThrough
    );
  });

  const incomeByGroup = new Map<string, number>();
  const expenseByGroup = new Map<string, number>();
  const expenseTransactions: FinanceGroupedAmount[] = [];
  let incomeTotal = 0;
  let expenseTotal = 0;
  let largestIncomeTransaction: FinanceGroupedAmount | null = null;
  let largestExpenseTransaction: FinanceGroupedAmount | null = null;

  filteredTransactions.forEach((transaction) => {
    if (transaction.amount === 0) {
      return;
    }

    const isIncome = transaction.amount > 0;
    const absoluteAmount = Math.abs(transaction.amount);
    const groupNames = resolveTransactionGroups({
      isIncome,
      categoryIds: transaction.categoryIds,
      categoryNames: yearData.categoryNames,
      categoryToBudget: yearData.categoryToBudget,
      categoryToIncomeGroup: yearData.categoryToIncomeGroup,
    });
    const amountPerGroup = absoluteAmount / groupNames.length;

    if (isIncome) {
      incomeTotal += absoluteAmount;
      if (!largestIncomeTransaction || absoluteAmount > largestIncomeTransaction.amount) {
        largestIncomeTransaction = {
          name: transaction.name,
          amount: absoluteAmount,
        };
      }

      groupNames.forEach((name) => {
        incomeByGroup.set(name, (incomeByGroup.get(name) ?? 0) + amountPerGroup);
      });
      return;
    }

    expenseTotal += absoluteAmount;
    expenseTransactions.push({
      name: transaction.name,
      amount: absoluteAmount,
    });

    if (!largestExpenseTransaction || absoluteAmount > largestExpenseTransaction.amount) {
      largestExpenseTransaction = {
        name: transaction.name,
        amount: absoluteAmount,
      };
    }

    groupNames.forEach((name) => {
      expenseByGroup.set(name, (expenseByGroup.get(name) ?? 0) + amountPerGroup);
    });
  });

  const budgetComparisons = yearData.budgets
    .map((budget) => {
      const periodBudget = roundCurrency(
        budget.annualBudget * (period.coveredMonths / 12),
      );
      const actualAmount = roundCurrency(expenseByGroup.get(budget.name) ?? 0);

      return {
        name: budget.name,
        budgetAmount: periodBudget,
        actualAmount,
        variance: roundCurrency(periodBudget - actualAmount),
      };
    })
    .filter((budget) => budget.budgetAmount > 0 || budget.actualAmount > 0)
    .sort((left, right) => right.actualAmount - left.actualAmount);

  const netCashFlow = roundCurrency(incomeTotal - expenseTotal);
  const budgetTotal = roundCurrency(
    budgetComparisons.reduce((sum, budget) => sum + budget.budgetAmount, 0),
  );
  const budgetVariance = roundCurrency(budgetTotal - expenseTotal);
  const budgetUtilization =
    budgetTotal > 0 ? Number((expenseTotal / budgetTotal).toFixed(4)) : null;

  return {
    periodLabel: period.label,
    periodType: period.periodType,
    year: period.year,
    startDate: period.startDate,
    endDate: period.endDate,
    dataThrough: period.dataThrough,
    coveredMonths: period.coveredMonths,
    transactionCount: filteredTransactions.length,
    incomeTotal: roundCurrency(incomeTotal),
    expenseTotal: roundCurrency(expenseTotal),
    netCashFlow,
    savingsRatio: calculateRatio(netCashFlow, incomeTotal),
    costRatio: calculateRatio(expenseTotal, incomeTotal),
    averageMonthlyIncome: roundCurrency(incomeTotal / period.coveredMonths),
    averageMonthlyExpense: roundCurrency(expenseTotal / period.coveredMonths),
    averageMonthlyNetCashFlow: roundCurrency(netCashFlow / period.coveredMonths),
    budgetTotal,
    budgetVariance,
    budgetUtilization,
    topIncomeGroups: mapToSortedGroups(incomeByGroup),
    topExpenseGroups: mapToSortedGroups(expenseByGroup),
    topCostTransactions: expenseTransactions
      .sort((left, right) => right.amount - left.amount)
      .slice(0, 5)
      .map((item) => ({
        name: item.name,
        amount: roundCurrency(item.amount),
      })),
    budgetComparisons,
    assetAnalysis: buildAssetAnalysis(
      yearData.assets,
      yearData.liabilities,
      period.snapshotQuarterHint,
    ),
    largestIncomeTransaction,
    largestExpenseTransaction,
  };
}

async function loadFinanceYearData(
  year: number,
  cache: Map<number, Promise<FinanceYearData>>,
): Promise<FinanceYearData> {
  const existing = cache.get(year);

  if (existing) {
    return existing;
  }

  const promise = (async () => {
    const config = getFinanceAirtableBaseConfig(year);
    const [transactions, categories, budgets, incomeGroups, assets, liabilities] =
      await Promise.all([
        fetchTransactions(config),
        fetchCategories(config),
        fetchBudgets(config),
        fetchIncomeGroups(config),
        fetchBalanceTable(config, 'assets'),
        fetchBalanceTable(config, 'liabilities'),
      ]);

    const categoryNames = new Map(
      categories.map((category) => [category.id, category.name]),
    );
    const categoryToBudget = new Map<string, string[]>();
    const categoryToIncomeGroup = new Map<string, string[]>();

    budgets.forEach((budget) => {
      budget.categoryIds.forEach((categoryId) => {
        const names = categoryToBudget.get(categoryId) ?? [];
        names.push(budget.name);
        categoryToBudget.set(categoryId, names);
      });
    });

    incomeGroups.forEach((group) => {
      group.categoryIds.forEach((categoryId) => {
        const names = categoryToIncomeGroup.get(categoryId) ?? [];
        names.push(group.name);
        categoryToIncomeGroup.set(categoryId, names);
      });
    });

    return {
      year,
      supportsDatedPeriods: config.supportsDatedPeriods,
      transactions,
      budgets,
      assets,
      liabilities,
      categoryNames,
      categoryToBudget,
      categoryToIncomeGroup,
    };
  })();

  cache.set(year, promise);
  return promise;
}

function buildAssetAnalysis(
  assets: BalanceRecord[],
  liabilities: BalanceRecord[],
  quarterHint?: number,
): FinanceAssetAnalysis | null {
  const snapshot = resolveBalanceSnapshot(assets, liabilities, quarterHint);

  if (!snapshot) {
    return null;
  }

  const housingAssets = sumMatchingAmounts(
    snapshot.assets,
    /house|housing|home|property|real estate|residence/i,
  );
  const liquidAssets = sumMatchingAmounts(
    snapshot.assets,
    /cash|checking|savings|deposit|money market|liquid/i,
  );
  const investmentAssets = sumMatchingAmounts(
    snapshot.assets,
    /stock|stocks|fund|funds|bond|bonds|etf|brokerage|investment|portfolio/i,
  );

  return {
    snapshotQuarter: snapshot.quarter,
    assetsTotal: snapshot.assetsTotal,
    liabilitiesTotal: snapshot.liabilitiesTotal,
    netWorth: snapshot.netWorth,
    debtToAssetRatio: calculateRatio(snapshot.liabilitiesTotal, snapshot.assetsTotal),
    housingAssetRatio: calculateRatio(housingAssets, snapshot.assetsTotal),
    liquidAssetRatio: calculateRatio(liquidAssets, snapshot.assetsTotal),
    investmentAssetRatio: calculateRatio(investmentAssets, snapshot.assetsTotal),
    assets: snapshot.assets,
    liabilities: snapshot.liabilities,
  };
}

function buildMetricChange(
  current: number | null,
  previous: number | null,
): FinanceMetricChange {
  if (current === null || previous === null) {
    return {
      current,
      previous,
      delta: null,
      deltaRate: null,
    };
  }

  const delta = roundCurrency(current - previous);

  return {
    current,
    previous,
    delta,
    deltaRate: previous === 0 ? null : Number((delta / Math.abs(previous)).toFixed(4)),
  };
}

function buildTrendRequests(period: ResolvedFinancePeriod): ResolvedFinancePeriod[] {
  if (period.periodType === 'month') {
    return buildMonthlyTrendRequests(period, 6);
  }

  if (period.periodType === 'quarter') {
    return buildQuarterlyTrendRequests(period, 4);
  }

  return buildYearlyTrendRequests(period, 3);
}

function buildMonthlyTrendRequests(
  period: ResolvedFinancePeriod,
  count: number,
): ResolvedFinancePeriod[] {
  if (!period.month) {
    return [];
  }

  const requests: ResolvedFinancePeriod[] = [];

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(period.year, period.month - 1 - offset, 1));
    requests.push(
      resolveFinanceReportPeriod(
        {
          periodType: 'month',
          year: date.getUTCFullYear(),
          month: date.getUTCMonth() + 1,
          outputDir: period.outputDir,
        },
        new Date(period.dataThrough),
      ),
    );
  }

  return requests;
}

function buildQuarterlyTrendRequests(
  period: ResolvedFinancePeriod,
  count: number,
): ResolvedFinancePeriod[] {
  if (!period.quarter) {
    return [];
  }

  const requests: ResolvedFinancePeriod[] = [];
  const currentQuarterIndex = period.year * 4 + (period.quarter - 1);

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const quarterIndex = currentQuarterIndex - offset;
    const year = Math.floor(quarterIndex / 4);
    const quarter = (quarterIndex % 4) + 1;

    requests.push(
      resolveFinanceReportPeriod(
        {
          periodType: 'quarter',
          year,
          quarter,
          outputDir: period.outputDir,
        },
        new Date(period.dataThrough),
      ),
    );
  }

  return requests;
}

function buildYearlyTrendRequests(
  period: ResolvedFinancePeriod,
  count: number,
): ResolvedFinancePeriod[] {
  const requests: ResolvedFinancePeriod[] = [];

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    requests.push(
      resolveFinanceReportPeriod(
        {
          periodType: 'year',
          year: period.year - offset,
          outputDir: period.outputDir,
        },
        new Date(period.dataThrough),
      ),
    );
  }

  return requests;
}

function resolvePreviousPeriod(period: ResolvedFinancePeriod): ResolvedFinancePeriod {
  if (period.periodType === 'month') {
    if (!period.month) {
      throw new Error('month is required when periodType is "month"');
    }

    const date = new Date(Date.UTC(period.year, period.month - 2, 1));
    return resolveFinanceReportPeriod(
      {
        periodType: 'month',
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        outputDir: period.outputDir,
      },
      new Date(period.dataThrough),
    );
  }

  if (period.periodType === 'quarter') {
    if (!period.quarter) {
      throw new Error('quarter is required when periodType is "quarter"');
    }

    const quarterIndex = period.year * 4 + (period.quarter - 2);
    const year = Math.floor(quarterIndex / 4);
    const quarter = (quarterIndex % 4) + 1;

    return resolveFinanceReportPeriod(
      {
        periodType: 'quarter',
        year,
        quarter,
        outputDir: period.outputDir,
      },
      new Date(period.dataThrough),
    );
  }

  return resolveFinanceReportPeriod(
    {
      periodType: 'year',
      year: period.year - 1,
      outputDir: period.outputDir,
    },
    new Date(period.dataThrough),
  );
}

function buildReportTitle(period: ResolvedFinancePeriod): string {
  if (period.periodType === 'month') {
    return `${period.year}-${String(period.month).padStart(2, '0')} Finance Report`;
  }

  if (period.periodType === 'quarter') {
    return `${period.year} Q${period.quarter} Finance Report`;
  }

  return `${period.year} Finance Report`;
}

function monthSpan(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  return (
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth()) +
    1
  );
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}

function mapToSortedGroups(values: Map<string, number>): FinanceGroupedAmount[] {
  return [...values.entries()]
    .map(([name, amount]) => ({
      name,
      amount: roundCurrency(amount),
    }))
    .sort((left, right) => right.amount - left.amount);
}

function resolveTransactionGroups(input: {
  isIncome: boolean;
  categoryIds: string[];
  categoryNames: Map<string, string>;
  categoryToBudget: Map<string, string[]>;
  categoryToIncomeGroup: Map<string, string[]>;
}): string[] {
  const resolvedNames = new Set<string>();

  input.categoryIds.forEach((categoryId) => {
    const linkedNames = input.isIncome
      ? input.categoryToIncomeGroup.get(categoryId)
      : input.categoryToBudget.get(categoryId);

    linkedNames?.forEach((name) => {
      if (name.trim()) {
        resolvedNames.add(name.trim());
      }
    });
  });

  if (resolvedNames.size > 0) {
    return [...resolvedNames];
  }

  const fallbackCategoryNames = input.categoryIds
    .map((categoryId) => input.categoryNames.get(categoryId)?.trim())
    .filter((name): name is string => Boolean(name));

  if (fallbackCategoryNames.length > 0) {
    return fallbackCategoryNames;
  }

  return [input.isIncome ? 'Uncategorized income' : 'Uncategorized expense'];
}

function resolveBalanceSnapshot(
  assets: BalanceRecord[],
  liabilities: BalanceRecord[],
  quarterHint?: number,
): {
  quarter: number;
  assetsTotal: number;
  liabilitiesTotal: number;
  netWorth: number;
  assets: FinanceBalanceLine[];
  liabilities: FinanceBalanceLine[];
} | null {
  const quarterCandidates = quarterHint
    ? [quarterHint, 4, 3, 2, 1]
    : [4, 3, 2, 1];

  for (const quarter of quarterCandidates) {
    if (quarter < 1 || quarter > 4) {
      continue;
    }

    const assetLines = assets
      .map((record) => ({
        name: record.name,
        amount: record.quarterlyValues[quarter as 1 | 2 | 3 | 4] ?? 0,
      }))
      .filter((line) => line.amount !== 0);
    const liabilityLines = liabilities
      .map((record) => ({
        name: record.name,
        amount: Math.abs(record.quarterlyValues[quarter as 1 | 2 | 3 | 4] ?? 0),
      }))
      .filter((line) => line.amount !== 0);

    if (assetLines.length === 0 && liabilityLines.length === 0) {
      continue;
    }

    const assetsTotal = roundCurrency(
      assetLines.reduce((sum, line) => sum + line.amount, 0),
    );
    const liabilitiesTotal = roundCurrency(
      liabilityLines.reduce((sum, line) => sum + line.amount, 0),
    );

    return {
      quarter,
      assetsTotal,
      liabilitiesTotal,
      netWorth: roundCurrency(assetsTotal - liabilitiesTotal),
      assets: assetLines.sort((left, right) => right.amount - left.amount),
      liabilities: liabilityLines.sort((left, right) => right.amount - left.amount),
    };
  }

  return null;
}

function sumMatchingAmounts(
  lines: FinanceBalanceLine[],
  pattern: RegExp,
): number {
  return roundCurrency(
    lines
      .filter((line) => pattern.test(line.name))
      .reduce((sum, line) => sum + line.amount, 0),
  );
}

async function fetchTransactions(
  config: ReturnType<typeof getFinanceAirtableBaseConfig>,
): Promise<TransactionRecord[]> {
  const table = config.tables.transactions;
  const records = await listAirtableRecords(config.baseId, table.tableId, [
    table.fields.nameFieldId,
    table.fields.amountFieldId!,
    table.fields.categoryLinkFieldId!,
    ...(table.fields.dateFieldId ? [table.fields.dateFieldId] : []),
  ]);

  return records.map((record) => ({
    id: record.id,
    name: readString(record.fields[table.fields.nameFieldId]) ?? record.id,
    amount: readNumber(record.fields[table.fields.amountFieldId!]) ?? 0,
    date: table.fields.dateFieldId
      ? readString(record.fields[table.fields.dateFieldId])
      : undefined,
    categoryIds: readStringArray(record.fields[table.fields.categoryLinkFieldId!]),
  }));
}

async function fetchCategories(
  config: ReturnType<typeof getFinanceAirtableBaseConfig>,
): Promise<Array<{ id: string; name: string }>> {
  const table = config.tables.categories;
  const records = await listAirtableRecords(config.baseId, table.tableId, [
    table.fields.nameFieldId,
  ]);

  return records.map((record) => ({
    id: record.id,
    name: readString(record.fields[table.fields.nameFieldId]) ?? record.id,
  }));
}

async function fetchBudgets(
  config: ReturnType<typeof getFinanceAirtableBaseConfig>,
): Promise<BudgetRecord[]> {
  const table = config.tables.budgets;
  const records = await listAirtableRecords(config.baseId, table.tableId, [
    table.fields.nameFieldId,
    table.fields.budgetFieldId!,
    table.fields.categoryLinksFieldId!,
  ]);

  return records.map((record) => ({
    name: readString(record.fields[table.fields.nameFieldId]) ?? record.id,
    annualBudget: readNumber(record.fields[table.fields.budgetFieldId!]) ?? 0,
    categoryIds: readStringArray(record.fields[table.fields.categoryLinksFieldId!]),
  }));
}

async function fetchIncomeGroups(
  config: ReturnType<typeof getFinanceAirtableBaseConfig>,
): Promise<Array<{ name: string; categoryIds: string[] }>> {
  const table = config.tables.incomeGroups;
  const records = await listAirtableRecords(config.baseId, table.tableId, [
    table.fields.nameFieldId,
    table.fields.categoryLinksFieldId!,
    table.fields.totalFieldId!,
  ]);

  return records.map((record) => ({
    name: readString(record.fields[table.fields.nameFieldId]) ?? record.id,
    categoryIds: readStringArray(record.fields[table.fields.categoryLinksFieldId!]),
  }));
}

async function fetchBalanceTable(
  config: ReturnType<typeof getFinanceAirtableBaseConfig>,
  tableKey: 'assets' | 'liabilities',
): Promise<BalanceRecord[]> {
  const table = config.tables[tableKey];
  const quarterFieldIds = table.fields.quarterFieldIds!;
  const records = await listAirtableRecords(config.baseId, table.tableId, [
    table.fields.nameFieldId,
    quarterFieldIds[1],
    quarterFieldIds[2],
    quarterFieldIds[3],
    quarterFieldIds[4],
  ]);

  return records.map((record) => ({
    name: readString(record.fields[table.fields.nameFieldId]) ?? record.id,
    quarterlyValues: {
      1: readNumber(record.fields[quarterFieldIds[1]]) ?? 0,
      2: readNumber(record.fields[quarterFieldIds[2]]) ?? 0,
      3: readNumber(record.fields[quarterFieldIds[3]]) ?? 0,
      4: readNumber(record.fields[quarterFieldIds[4]]) ?? 0,
    },
  }));
}

async function listAirtableRecords(
  baseId: string,
  tableId: string,
  fieldIds: string[],
): Promise<AirtableRecord[]> {
  const pat = process.env.AIRTABLE_PAT?.trim();

  if (!pat) {
    throw new Error('AIRTABLE_PAT is not configured.');
  }

  const records: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(`${AIRTABLE_API_BASE_URL}/${baseId}/${tableId}`);
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('returnFieldsByFieldId', 'true');
    fieldIds.forEach((fieldId) => {
      url.searchParams.append('fields[]', fieldId);
    });

    if (offset) {
      url.searchParams.set('offset', offset);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${pat}`,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Airtable request failed for ${tableId}: ${response.status} ${response.statusText} ${body}`,
      );
    }

    const payload = (await response.json()) as {
      records?: AirtableRecord[];
      offset?: string;
    };

    records.push(...(payload.records ?? []));
    offset = payload.offset;
  } while (offset);

  return records;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
}
