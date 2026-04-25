import type { StorageCreateAgentInput } from '@mastra/core/storage';
import { MARKET_INDEX_TREND_AGENT_INSTRUCTIONS } from '../prompts/market-trend';
import { PERSONAL_FINANCE_AGENT_INSTRUCTIONS } from '../prompts/personal-finance';
import { storage } from './storage';

const PERSONAL_FINANCE_AGENT_ID = 'personal-finance-agent';
const MARKET_INDEX_TREND_AGENT_ID = 'market-index-trend-agent';

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
      instructions: PERSONAL_FINANCE_AGENT_INSTRUCTIONS,
      model: parseModel('openrouter/anthropic/claude-sonnet-4.5'),
      tools: {
        'analyze-finances': {},
      },
    },
  });
}

export async function ensureStoredMarketIndexTrendAgent(): Promise<void> {
  const agentsStore = await storage.getStore('agents');

  if (!agentsStore) {
    return;
  }

  const existingAgent = await agentsStore.getById(MARKET_INDEX_TREND_AGENT_ID);

  if (existingAgent) {
    return;
  }

  await agentsStore.create({
    agent: {
      id: MARKET_INDEX_TREND_AGENT_ID,
      name: 'Market Index Trend Agent',
      description: 'Stored Studio snapshot for the code-defined market index trend agent.',
      instructions: MARKET_INDEX_TREND_AGENT_INSTRUCTIONS,
      model: parseModel('openrouter/openai/gpt-5.4'),
      tools: {
        'calculate-market-index-trends': {},
      },
    },
  });
}
