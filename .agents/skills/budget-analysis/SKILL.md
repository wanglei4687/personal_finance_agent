---
name: budget-analysis
description: Analyze personal finance data for a month, quarter, or custom date range; produce monthly and quarterly comparison metrics; compare with prior-year equivalents; detect anomalies; and generate a concise report.
---

# Budget Analysis

## Purpose
Use this skill to analyze imported personal finance data and generate a clear summary of cash flow, spending patterns, anomalies, monthly comparisons, and quarterly comparisons.

## When to use
Use this skill when the task involves:
- monthly spending analysis
- quarterly spending analysis
- month-over-month comparison
- quarter-over-quarter comparison
- year-over-year comparison
- category breakdowns
- savings rate calculations
- recurring expense review
- anomaly detection
- monthly or quarterly finance reports

## Expected inputs
The user may specify:
- input file or directory
- target month, quarter, or custom date range
- whether to use raw or processed data
- whether to generate a markdown report
- whether to compare against previous months
- whether to compare against previous quarters
- whether to compare against the same period last year

If these inputs are not provided, infer sensible defaults from repository conventions.

## Required workflow
1. Read the requested input files from `data/raw/` or `data/processed/`.
2. Inspect schema and date coverage.
3. Validate transaction fields and row counts.
4. Separate transfers from actual spending when possible.
5. Compute current-period metrics:
   - total income
   - total expenses
   - net cash flow
   - savings rate
   - top spending categories
6. Compute monthly comparison metrics when monthly history is available:
   - current month totals
   - prior month totals
   - month-over-month absolute change
   - month-over-month percentage change
7. Compute quarterly comparison metrics when quarterly history is available:
   - current quarter totals
   - prior quarter totals
   - quarter-over-quarter absolute change
   - quarter-over-quarter percentage change
8. If prior-year data is available, compute year-over-year comparisons for both:
   - equivalent month last year
   - equivalent quarter last year
9. Detect anomalies such as:
   - unusually large expenses
   - duplicate-looking transactions
   - category spikes
   - unexpected subscriptions or recurring charges
10. Generate a concise summary and, if requested, write a report to `reports/`.

## Month rules
- use calendar months unless the user specifies otherwise
- if the current month is incomplete, clearly label the month analysis as partial
- compare against the prior comparable month only when coverage is reasonably comparable

## Quarter rules
- use standard calendar quarters unless the user specifies otherwise
- Q1 = Jan 1 to Mar 31
- Q2 = Apr 1 to Jun 30
- Q3 = Jul 1 to Sep 30
- Q4 = Oct 1 to Dec 31
- if the current quarter is incomplete, clearly label the quarter analysis as partial
- compare against the prior comparable quarter only when coverage is reasonably comparable

## Comparison rules
- report both absolute change and percentage change
- distinguish monthly comparison results from quarterly comparison results
- highlight category-level changes that materially affect spending
- if prior-period or prior-year coverage is incomplete, clearly state that the comparison is partial or unreliable
- do not overinterpret small changes when the underlying amounts are minimal

## Output format
Return:
1. Summary
2. Period covered
3. Analysis granularity
4. Key metrics
5. Monthly comparison
6. Quarterly comparison
7. Year-over-year comparison
8. Top spending categories
9. Category changes
10. Anomalies
11. Data quality issues
12. Recommended next actions

## Definition of done
The task is complete only when:
- the requested period was analyzed
- key metrics were computed
- monthly comparison was included when monthly history is available
- quarterly comparison was included when quarterly history is available
- year-over-year comparison was included when prior-year data is available
- anomalies and data quality issues were reported