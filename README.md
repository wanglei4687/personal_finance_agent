# Personal Finance Agent

This project is a [Mastra](https://mastra.ai/) app centered on personal finance coaching. It exposes:

- `personalFinanceAgent`: a budgeting and cash-flow coach for monthly finance questions
- `financialCheckInWorkflow`: a workflow that analyzes a monthly budget and returns a concise action plan
- `financeAnalysisTool`: a structured tool for computing expense ratios, debt pressure, savings capacity, and top priorities

## Run Locally

```sh
npm run dev
```

Open [http://localhost:4111](http://localhost:4111) to use Mastra Studio.

## Model Provider

The agent is configured with an `"openrouter/..."` model ID:

```sh
OPENROUTER_API_KEY=your_api_key
```

Mastra will use its native OpenRouter provider for this model. This is the correct setup when you want OpenRouter-hosted models and tool calling together.

## Airtable MCP

This project includes an Airtable MCP client config in `src/mastra/mcp/airtable-client.ts`.

Set these environment variables to enable Airtable tools for the agent:

```sh
AIRTABLE_PAT=pat_your_token
AIRTABLE_MCP_URL=https://mcp.airtable.com/mcp
```

The default endpoint is Airtable's official MCP server. When `AIRTABLE_PAT` is present, the agent will attempt to load Airtable MCP tools at startup and expose them alongside the finance tool.

## What The Agent Does

The agent is designed for practical household-finance support:

- Reviews monthly income and expense breakdowns
- Flags negative cash flow, high discretionary spend, debt pressure, and weak emergency reserves
- Suggests concrete next actions in priority order
- Keeps responses educational rather than regulated financial, tax, or legal advice

## Example Workflow Input

Use this shape when testing the `financialCheckInWorkflow`:

```json
{
  "monthlyIncome": 6200,
  "monthlyExpenses": [
    { "name": "Rent", "amount": 1900, "type": "essential" },
    { "name": "Groceries", "amount": 650, "type": "essential" },
    { "name": "Dining Out", "amount": 420, "type": "discretionary" },
    { "name": "Credit Card Payment", "amount": 300, "type": "debt" },
    { "name": "Emergency Fund", "amount": 500, "type": "savings" }
  ],
  "savingsGoal": 800,
  "emergencyFundMonths": 1.5,
  "debts": [
    {
      "name": "Credit Card",
      "balance": 5400,
      "apr": 24.99,
      "minimumPayment": 300
    }
  ]
}
```

## Key Files

- `src/mastra/agents/personal-finance-agent.ts`
- `src/mastra/tools/finance-analysis-tool.ts`
- `src/mastra/workflows/financial-check-in-workflow.ts`
