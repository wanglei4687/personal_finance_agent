import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  analyzeFinancialProfile,
} from '../tools/finance-analysis-tool';

const expenseSchema = z.object({
  name: z.string(),
  amount: z.number().nonnegative(),
  type: z.enum(['essential', 'discretionary', 'debt', 'savings']),
});

const debtSchema = z.object({
  name: z.string(),
  balance: z.number().nonnegative(),
  apr: z.number().min(0).max(100).optional(),
  minimumPayment: z.number().nonnegative(),
});

const financialProfileSchema = z.object({
  monthlyIncome: z.number().positive(),
  monthlyExpenses: z.array(expenseSchema).min(1),
  savingsGoal: z.number().nonnegative().optional(),
  emergencyFundMonths: z.number().min(0).optional(),
  debts: z.array(debtSchema).optional(),
});

const analysisSchema = z.object({
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

const runFinancialAnalysis = createStep({
  id: 'run-financial-analysis',
  description: 'Calculates budget ratios, cash flow, and finance priorities',
  inputSchema: financialProfileSchema,
  outputSchema: analysisSchema,
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    return analyzeFinancialProfile(inputData);
  },
});

const writeCoachingSummary = createStep({
  id: 'write-coaching-summary',
  description: 'Turns the financial analysis into a short action plan',
  inputSchema: analysisSchema,
  outputSchema: z.object({
    summary: z.string(),
    nextActions: z.array(z.string()),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) {
      throw new Error('Analysis data not found');
    }

    const agent = mastra?.getAgent('personal-finance-agent');
    if (!agent) {
      throw new Error('Personal finance agent not found');
    }

    const result = await agent.generate([
      {
        role: 'user',
        content: `
          Review this monthly financial analysis and produce a concise coaching note.

          Requirements:
          - Start with a single-sentence summary
          - Then provide exactly 3 next actions
          - Keep the tone practical and direct
          - Do not repeat every metric

          Analysis:
          ${JSON.stringify(inputData, null, 2)}
        `,
      },
    ]);

    return {
      summary: result.text,
      nextActions: inputData.recommendations.slice(0, 3),
    };
  },
});

const financialCheckInWorkflow = createWorkflow({
  id: 'financial-check-in-workflow',
  inputSchema: financialProfileSchema,
  outputSchema: z.object({
    summary: z.string(),
    nextActions: z.array(z.string()),
  }),
})
  .then(runFinancialAnalysis)
  .then(writeCoachingSummary);

financialCheckInWorkflow.commit();

export { financialCheckInWorkflow };
