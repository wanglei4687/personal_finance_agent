# Personal Finance Agent

This repository is used to import, validate, and analyze personal finance data.

## Directory conventions
- Raw imported data must be written to `data/raw/`
- Cleaned or normalized data must be written to `data/processed/`
- Reports must be written to `reports/`

## Global rules
- Never modify source-of-truth raw files in place
- Never delete imported finance data unless explicitly requested
- Treat all finance data as sensitive
- Avoid exposing full account numbers or other sensitive identifiers in final outputs
- Prefer aggregated summaries over dumping raw transaction rows
- Always report assumptions, missing fields, duplicates, and rejected rows

## Data quality expectations
Always check for:
- required fields
- duplicate records
- malformed dates
- malformed numeric amounts
- unexpected null values
- inconsistent currency values

## Finance-specific rules
- Preserve original source identifiers whenever possible
- Keep transfers separate from actual expenses when possible
- Do not guess ambiguous categories; use `uncategorized`
- Clearly distinguish imported raw data from normalized data

## Output expectations
When producing analysis, include:
1. period covered
2. analysis granularity (`month`, `quarter`, or custom range)
3. total income
4. total expenses
5. net cash flow
6. savings rate
7. top spending categories
8. month-over-month comparison when monthly data is available
9. quarter-over-quarter comparison when quarterly data is available
10. year-over-year comparison against the equivalent prior-year period when data is available
11. anomalies or unusual transactions
12. data quality issues
13. assumptions

## Preferred workflow
1. Import raw data
2. Validate schema and row counts
3. Normalize fields if requested
4. Analyze the requested period
5. Produce monthly comparison metrics when monthly history is available
6. Produce quarterly comparison metrics when quarterly history is available
7. Generate a concise report


