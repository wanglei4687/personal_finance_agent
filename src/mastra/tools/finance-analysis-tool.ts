import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { calculateRatio, formatCurrency } from '../../utils/finance';

const expenseSchema = z.object({
  name: z.string().describe('Expense label'),
  amount: z.number().nonnegative().describe('Monthly amount in the user currency'),
  type: z
    .enum(['essential', 'discretionary', 'debt', 'savings'])
    .describe('How this item should be classified'),
});

const debtSchema = z.object({
  name: z.string().describe('Debt name'),
  balance: z.number().nonnegative().describe('Outstanding balance'),
  apr: z.number().min(0).max(100).optional().describe('APR percentage'),
  minimumPayment: z
    .number()
    .nonnegative()
    .describe('Required monthly minimum payment'),
});

const financeAnalysisInputSchema = z.object({
  monthlyIncome: z.number().positive().describe('Net monthly income'),
  monthlyExpenses: z
    .array(expenseSchema)
    .min(1)
    .describe('Monthly expenses grouped into finance categories'),
  savingsGoal: z
    .number()
    .nonnegative()
    .optional()
    .describe('Target monthly savings amount'),
  emergencyFundMonths: z
    .number()
    .min(0)
    .optional()
    .describe('Current emergency fund expressed in months of essential expenses'),
  debts: z
    .array(debtSchema)
    .optional()
    .describe('Optional list of current debts'),
});

const financeAnalysisOutputSchema = z.object({
  income: z.number(),
  totalExpenses: z.number(),
  essentialSpending: z.number(),
  discretionarySpending: z.number(),
  debtPayments: z.number(),
  savingsContributions: z.number(),
  netCashFlow: z.number(),
  savingsRate: z.number(),
  essentialRate: z.number(),
  discretionaryRate: z.number(),
  debtPaymentRate: z.number(),
  debtToIncomeRate: z.number(),
  emergencyFundStatus: z.enum(['unknown', 'low', 'healthy']),
  savingsGoalGap: z.number(),
  highestPriority: z.string(),
  recommendations: z.array(z.string()),
});

export type FinancialProfile = z.infer<typeof financeAnalysisInputSchema>;
export type FinancialAnalysis = z.infer<typeof financeAnalysisOutputSchema>;
type DebtEntry = NonNullable<FinancialProfile['debts']>[number];

export const financeAnalysisTool = createTool({
  id: 'analyze-finances',
  description:
    'Analyze a personal monthly budget, spending mix, debt load, and savings capacity',
  inputSchema: financeAnalysisInputSchema,
  outputSchema: financeAnalysisOutputSchema,
  execute: async (inputData) => {
    return analyzeFinancialProfile(inputData);
  },
});

export function analyzeFinancialProfile(
  inputData: FinancialProfile,
): FinancialAnalysis {
  const monthlyIncome = inputData.monthlyIncome;
  const monthlyExpenses = inputData.monthlyExpenses;
  const savingsGoal = inputData.savingsGoal ?? 0;
  const emergencyFundMonths = inputData.emergencyFundMonths;
  const debts = inputData.debts ?? [];

  const essentialSpending = sumByType(monthlyExpenses, 'essential');
  const discretionarySpending = sumByType(monthlyExpenses, 'discretionary');
  const debtPayments = sumByType(monthlyExpenses, 'debt');
  const savingsContributions = sumByType(monthlyExpenses, 'savings');
  const totalExpenses =
    essentialSpending +
    discretionarySpending +
    debtPayments +
    savingsContributions;
  const netCashFlow = monthlyIncome - totalExpenses;

  const debtMinimums = debts.reduce(
    (total: number, debt: DebtEntry) => total + debt.minimumPayment,
    0,
  );
  const debtToIncomeRate = calculateRatio(
    Math.max(debtPayments, debtMinimums),
    monthlyIncome,
    0,
  );
  const savingsRate = calculateRatio(savingsContributions, monthlyIncome, 0);
  const essentialRate = calculateRatio(essentialSpending, monthlyIncome, 0);
  const discretionaryRate = calculateRatio(discretionarySpending, monthlyIncome, 0);
  const debtPaymentRate = calculateRatio(debtPayments, monthlyIncome, 0);
  const savingsGoalGap = Math.max(0, savingsGoal - savingsContributions);

  const emergencyFundStatus: FinancialAnalysis['emergencyFundStatus'] =
    emergencyFundMonths === undefined
      ? 'unknown'
      : emergencyFundMonths < 3
        ? 'low'
        : 'healthy';

  const recommendations: string[] = [];

  if (netCashFlow < 0) {
    recommendations.push(
      'Reduce discretionary spending immediately or increase income because the budget is operating at a monthly deficit.',
    );
  }

  if (discretionaryRate > 0.3) {
    recommendations.push(
      'Discretionary spending is above 30% of income; review subscriptions, dining, shopping, and entertainment first.',
    );
  }

  if (emergencyFundStatus === 'low') {
    recommendations.push(
      'Build the emergency fund toward at least 3 months of essential expenses before taking on new financial risk.',
    );
  }

  if (debtToIncomeRate > 0.2) {
    recommendations.push(
      'Debt payments are consuming a large share of income; prioritize extra payments toward the highest-APR balance after covering essentials.',
    );
  }

  if (savingsGoalGap > 0 && netCashFlow > 0) {
    recommendations.push(
      `Redirect ${formatCurrency(Math.min(netCashFlow, savingsGoalGap), {
        locale: 'en-US',
        maximumFractionDigits: 0,
      })} of monthly surplus toward the stated savings goal.`,
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      'Current cash flow looks stable; keep tracking category drift and automate savings to maintain progress.',
    );
  }

  return {
    income: monthlyIncome,
    totalExpenses,
    essentialSpending,
    discretionarySpending,
    debtPayments,
    savingsContributions,
    netCashFlow,
    savingsRate,
    essentialRate,
    discretionaryRate,
    debtPaymentRate,
    debtToIncomeRate,
    emergencyFundStatus,
    savingsGoalGap,
    highestPriority: pickHighestPriority({
      netCashFlow,
      emergencyFundStatus,
      debtToIncomeRate,
      savingsGoalGap,
    }),
    recommendations,
  };
}

function sumByType(
  expenses: Array<{ amount: number; type: 'essential' | 'discretionary' | 'debt' | 'savings' }>,
  type: 'essential' | 'discretionary' | 'debt' | 'savings',
): number {
  return expenses
    .filter((expense) => expense.type === type)
    .reduce((total, expense) => total + expense.amount, 0);
}

function pickHighestPriority(input: {
  netCashFlow: number;
  emergencyFundStatus: 'unknown' | 'low' | 'healthy';
  debtToIncomeRate: number;
  savingsGoalGap: number;
}): string {
  if (input.netCashFlow < 0) {
    return 'Fix negative monthly cash flow';
  }

  if (input.emergencyFundStatus === 'low') {
    return 'Build emergency reserves';
  }

  if (input.debtToIncomeRate > 0.2) {
    return 'Reduce debt payment pressure';
  }

  if (input.savingsGoalGap > 0) {
    return 'Close savings goal gap';
  }

  return 'Maintain the current plan and monitor spending drift';
}
