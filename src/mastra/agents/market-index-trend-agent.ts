import { Agent } from '@mastra/core/agent';
import { MARKET_INDEX_TREND_AGENT_INSTRUCTIONS } from '../../prompts/market-trend';
import { marketDataTools } from '../mcp/postgres-market-server';
import { getMarketTrendMemory } from '../storage';
import { marketIndexTrendTool } from '../tools/market-index-trend-tool';

export const marketIndexTrendAgent = new Agent({
  id: 'market-index-trend-agent',
  name: 'Market Index Trend Agent',
  description:
    'Analyzes market index and benchmark trends using PostgreSQL historical market data.',
  instructions: MARKET_INDEX_TREND_AGENT_INSTRUCTIONS,
  model: 'openrouter/openai/gpt-5.4',
  tools: { marketIndexTrendTool, ...marketDataTools },
  memory: getMarketTrendMemory(),
});
