export const PERSONAL_FINANCE_AGENT_INSTRUCTIONS = `
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
`.trim();

export function buildFinancialCheckInSummaryPrompt(analysis: unknown): string {
  return `
Review this monthly financial analysis and produce a concise coaching note.

Requirements:
- Start with a single-sentence summary
- Then provide exactly 3 next actions
- Keep the tone practical and direct
- Do not repeat every metric

Analysis:
${JSON.stringify(analysis, null, 2)}
`.trim();
}

export function buildFinancePeriodReportPrompt(summary: unknown): string {
  const reportSummary = summary as {
    periodType?: 'month' | 'quarter' | 'year';
    previousComparison?: Record<string, unknown>;
  };
  const includeBalanceSheetAnalysis = reportSummary.periodType !== 'month';
  const promptData =
    reportSummary.periodType === 'month'
      ? {
          ...reportSummary,
          assetAnalysis: null,
          previousComparison: reportSummary.previousComparison
            ? {
                ...reportSummary.previousComparison,
                netWorth: {
                  current: null,
                  previous: null,
                  delta: null,
                  deltaRate: null,
                },
              }
            : reportSummary.previousComparison,
        }
      : reportSummary;
  const coveredTopics = includeBalanceSheetAnalysis
    ? 'savings rate, cost ratio, asset analysis, spending trend, savings trend'
    : 'savings rate, cost ratio, spending trend, savings trend';
  const requiredHeadings = includeBalanceSheetAnalysis
    ? '## Income And Expense Summary, ## Comparison With Previous Period, ## Spending And Savings Trends, ## Budget Performance, ## Asset Analysis, ## Key Findings, ## Next Actions'
    : '## Income And Expense Summary, ## Comparison With Previous Period, ## Spending And Savings Trends, ## Budget Performance, ## Key Findings, ## Next Actions';

  return `
Generate an English Markdown report based on the finance data below. Write like a professional personal finance advisor.

Requirements:
- Use the provided title exactly as the report title
- Start with a short executive takeaway that states the most important financial conclusion
- Compare against the previous period explicitly: month vs previous month, quarter vs previous quarter, year vs previous year
- All monetary amounts are in CNY
- Use the '¥' symbol for every monetary amount, for example '¥22,998.36'
- Never use '$', 'USD', or any non-CNY currency symbol in the report
- Cover these topics: ${coveredTopics}
- Use exactly these second-level headings: ${requiredHeadings}
- For monthly reports, do not include asset analysis, asset breakdown, liability breakdown, or quarter-end net worth commentary
- Under "## Next Actions", provide exactly 3 numbered action items and make them specific
- Use only the numbers provided; do not invent amounts, ratios, or facts
- If a section has no data, write "No data available"
- Do not output code fences
- Keep the tone professional, direct, and concise

Finance data:
${JSON.stringify(promptData, null, 2)}
`.trim();
}
