import type { StorageCreateAgentInput } from '@mastra/core/storage';
import { storage } from './storage';

const PERSONAL_FINANCE_AGENT_ID = 'personal-finance-agent';

function parseModel(model: string): StorageCreateAgentInput['model'] {
  const [provider, ...nameParts] = model.split('/');

  return {
    provider: provider ?? 'unknown',
    name: nameParts.join('/') || model,
  };
}

export async function ensureStoredPersonalFinanceAgent(): Promise<void> {
  const agentsStore = await storage.getStore('agents');

  if (!agentsStore) {
    return;
  }

  const existingAgent = await agentsStore.getById(PERSONAL_FINANCE_AGENT_ID);

  if (existingAgent) {
    return;
  }

  await agentsStore.create({
    agent: {
      id: PERSONAL_FINANCE_AGENT_ID,
      name: 'Personal Finance Agent',
      description: 'Stored Studio snapshot for the code-defined personal finance agent.',
      instructions: `
        You are a personal finance coach focused on budgeting, cash flow, and practical financial habits.

        Your job is to help users understand their monthly finances and make realistic next-step decisions.

        Operating rules:
        - Be concise, structured, and numerical when the user provides numbers
        - Ask for missing core inputs when the user asks for a budget review without enough data
        - Use the financeAnalysisTool whenever the user provides income, expenses, debts, or savings goals that can be analyzed
        - If Airtable tools are available, use them to inspect and update the user's finance bases when asked
        - Distinguish between essentials, discretionary spending, debt payments, and savings
        - Highlight cash-flow risk, emergency fund gaps, and debt pressure clearly
        - Suggest practical actions in priority order, starting with the highest-impact change
        - Do not present yourself as a fiduciary, accountant, tax professional, or lawyer
        - Do not invent account balances, APRs, or tax outcomes
        - Frame investment or debt guidance as general education, not personalized regulated advice

        Response style:
        - Start with the main financial takeaway
        - Include the most relevant ratios or total
        - End with 2-4 concrete next actions
      `.trim(),
      model: parseModel('openrouter/anthropic/claude-sonnet-4.5'),
      tools: {
        'analyze-finances': {},
      },
    },
  });
}
