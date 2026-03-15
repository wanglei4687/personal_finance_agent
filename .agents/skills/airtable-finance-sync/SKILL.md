---
name: airtable-finance-sync
description: Import personal finance data from Airtable through MCP, validate required fields, and save raw or normalized files under data/raw or data/processed. Use this when the user asks to sync, import, refresh, or pull finance records from Airtable.
---

# Airtable Finance Sync

## Purpose
Use this skill to import finance-related records from Airtable through MCP into the local repository for downstream analysis.

## When to use
Use this skill when the task involves:
- importing records from Airtable
- refreshing local finance data from Airtable
- pulling budget, transaction, account, category, or recurring expense tables
- preparing Airtable data for later analysis or reporting

## Expected inputs
The user may specify:
- Airtable base name or base id
- table name
- view name
- output format (`json` or `csv`)
- destination path
- date range filters
- whether to perform a full sync or incremental sync

If some inputs are missing, infer sensible defaults from the repository structure or project instructions.

## Required workflow
1. Discover the Airtable MCP tools or resources available in the current environment.
2. Identify the requested base and table.
3. Read records from Airtable through MCP.
4. Preserve the Airtable record id and original source fields whenever possible.
5. Validate required fields before writing output files.
6. Save raw exported data to `data/raw/airtable/`.
7. Only write normalized or transformed data to `data/processed/` if explicitly requested.
8. Report row counts, missing fields, duplicates, malformed values, and rejected rows.

## Validation rules
Always check for:
- required columns
- empty or missing primary identifiers
- invalid dates
- malformed numeric amounts
- duplicate records
- unexpected nulls in important finance fields

If validation fails:
- do not silently drop rows
- write a reject file if appropriate, or clearly report rejected rows
- explain schema mismatches

## Finance-specific guidance
When importing transaction-like records:
- preserve the original record id from Airtable
- preserve original currency values
- do not guess unclear categories
- mark ambiguous rows as `uncategorized`
- keep transfers separate from expenses if the source supports that distinction

## Output rules
Return a concise summary containing:
1. source base and table
2. number of rows imported
3. output file paths
4. validation issues
5. assumptions made
6. recommended next step

## Safety rules
- Never overwrite existing raw files unless explicitly requested
- Never delete local finance data as part of import
- Treat financial data as sensitive
- Avoid printing sensitive identifiers in final responses

## Definition of done
The task is complete only when:
- Airtable records were pulled successfully through MCP
- output files were written to the correct location
- validation results were reported
- schema mismatches and rejected rows were clearly explained