import { Agent } from '@mastra/core/agent';
import { getAirtableTools } from '../mcp/airtable-client';
import { PERSONAL_FINANCE_AGENT_INSTRUCTIONS } from '../../prompts/personal-finance';
import { getPersonalFinanceMemory } from '../storage';
import { financeAnalysisTool } from '../tools/finance-analysis-tool';

const airtableTools = await getAirtableTools();

export const personalFinanceAgent = new Agent({
  id: 'personal-finance-agent',
  name: 'Personal Finance Agent',
  instructions: PERSONAL_FINANCE_AGENT_INSTRUCTIONS,
  model: 'openrouter/openai/gpt-5.4',
  tools: { financeAnalysisTool, ...airtableTools },
  memory: getPersonalFinanceMemory(),
});
