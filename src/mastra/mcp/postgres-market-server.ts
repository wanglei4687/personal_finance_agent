import { createTool } from '@mastra/core/tools';
import { MCPServer } from '@mastra/mcp';
import { z } from 'zod';
import { getPostgresDb } from '../storage';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 250;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const instrumentSchema = z.object({
  instrumentCode: z.string(),
  displayName: z.string(),
  yahooSymbol: z.string(),
  assetClass: z.string(),
  marketRegion: z.string(),
  quoteCurrency: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const priceHistoryRowSchema = z.object({
  tradeDate: z.string(),
  openPrice: z.string().nullable(),
  highPrice: z.string().nullable(),
  lowPrice: z.string().nullable(),
  closePrice: z.string(),
  adjustedClosePrice: z.string().nullable(),
  volume: z.string().nullable(),
  sourceName: z.string(),
  fetchedAt: z.string(),
});

const changeStatsRowSchema = z.object({
  instrumentCode: z.string(),
  displayName: z.string(),
  yahooSymbol: z.string(),
  assetClass: z.string(),
  marketRegion: z.string(),
  quoteCurrency: z.string(),
  isActive: z.boolean(),
  tradeDate: z.string(),
  openPrice: z.string().nullable(),
  highPrice: z.string().nullable(),
  lowPrice: z.string().nullable(),
  closePrice: z.string(),
  effectiveClosePrice: z.string(),
  volume: z.string().nullable(),
  previousClosePrice: z.string().nullable(),
  dayChangeAmount: z.string().nullable(),
  dayChangePct: z.string().nullable(),
  change7dAmount: z.string().nullable(),
  change7dPct: z.string().nullable(),
  change30dAmount: z.string().nullable(),
  change30dPct: z.string().nullable(),
  change90dAmount: z.string().nullable(),
  change90dPct: z.string().nullable(),
  changeSinceLoadedAmount: z.string().nullable(),
  changeSinceLoadedPct: z.string().nullable(),
});

const instrumentSelectorSchema = z.object({
  instrumentCode: z.string().trim().min(1).optional(),
  yahooSymbol: z.string().trim().min(1).optional(),
});

const instrumentListFilterSchema = z.object({
  query: z.string().trim().min(1).optional(),
  assetClass: z.string().trim().min(1).optional(),
  marketRegion: z.string().trim().min(1).optional(),
  quoteCurrency: z.string().trim().min(1).optional(),
  isActive: z.boolean().optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
});

const historyInputSchema = instrumentSelectorSchema.extend({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional().default(90),
  sortDirection: z.enum(['asc', 'desc']).optional().default('desc'),
});

const latestSnapshotInputSchema = z.object({
  instrumentCodes: z.array(z.string().trim().min(1)).optional(),
  yahooSymbols: z.array(z.string().trim().min(1)).optional(),
  assetClass: z.string().trim().min(1).optional(),
  marketRegion: z.string().trim().min(1).optional(),
  quoteCurrency: z.string().trim().min(1).optional(),
  onlyActive: z.boolean().optional().default(true),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
});

function normalizeString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeStringArray(values: string[] | undefined): string[] | undefined {
  const normalized = values?.map((value) => value.trim()).filter(Boolean);
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function assertIsoDate(value: string | undefined, fieldName: string): string | undefined {
  if (!value) {
    return undefined;
  }

  if (!ISO_DATE_PATTERN.test(value)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD format`);
  }

  return value;
}

function assertDateRange(startDate: string | undefined, endDate: string | undefined): void {
  if (startDate && endDate && startDate > endDate) {
    throw new Error('startDate must be earlier than or equal to endDate');
  }
}

function serializeDbValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value ?? null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => serializeDbValue(entry));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        serializeDbValue(entry),
      ]),
    );
  }

  return value;
}

function serializeRow<T extends Record<string, unknown>>(row: T): T {
  return serializeDbValue(row) as T;
}

async function resolveInstrument(input: z.infer<typeof instrumentSelectorSchema>) {
  const instrumentCode = normalizeString(input.instrumentCode);
  const yahooSymbol = normalizeString(input.yahooSymbol);

  if (!instrumentCode && !yahooSymbol) {
    throw new Error('Provide instrumentCode or yahooSymbol');
  }

  const whereParts: string[] = [];
  const values: string[] = [];

  if (instrumentCode) {
    values.push(instrumentCode);
    whereParts.push(`instrument_code = $${values.length}`);
  }

  if (yahooSymbol) {
    values.push(yahooSymbol);
    whereParts.push(`yahoo_symbol = $${values.length}`);
  }

  const row = await getPostgresDb().oneOrNone<Record<string, unknown>>(
    `
      SELECT
        instrument_code AS "instrumentCode",
        display_name AS "displayName",
        yahoo_symbol AS "yahooSymbol",
        asset_class AS "assetClass",
        market_region AS "marketRegion",
        quote_currency AS "quoteCurrency",
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM market_instruments
      WHERE ${whereParts.join(' AND ')}
      LIMIT 1
    `,
    values,
  );

  if (!row) {
    throw new Error('Instrument not found in market_instruments');
  }

  return instrumentSchema.parse(serializeRow(row));
}

const searchMarketInstrumentsTool = createTool({
  id: 'search-market-instruments',
  description:
    'List instruments from PostgreSQL market_instruments with optional text and dimension filters.',
  inputSchema: instrumentListFilterSchema,
  outputSchema: z.object({
    count: z.number().int(),
    instruments: z.array(instrumentSchema),
  }),
  mcp: {
    annotations: {
      title: 'Search Market Instruments',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  execute: async (input) => {
    const whereParts: string[] = [];
    const values: unknown[] = [];
    const query = normalizeString(input.query);

    if (query) {
      values.push(`%${query}%`);
      whereParts.push(
        `(instrument_code ILIKE $${values.length} OR display_name ILIKE $${values.length} OR yahoo_symbol ILIKE $${values.length})`,
      );
    }

    const assetClass = normalizeString(input.assetClass);
    if (assetClass) {
      values.push(assetClass);
      whereParts.push(`asset_class = $${values.length}`);
    }

    const marketRegion = normalizeString(input.marketRegion);
    if (marketRegion) {
      values.push(marketRegion);
      whereParts.push(`market_region = $${values.length}`);
    }

    const quoteCurrency = normalizeString(input.quoteCurrency);
    if (quoteCurrency) {
      values.push(quoteCurrency);
      whereParts.push(`quote_currency = $${values.length}`);
    }

    if (typeof input.isActive === 'boolean') {
      values.push(input.isActive);
      whereParts.push(`is_active = $${values.length}`);
    }

    values.push(input.limit);
    const rows = await getPostgresDb().any<Record<string, unknown>>(
      `
        SELECT
          instrument_code AS "instrumentCode",
          display_name AS "displayName",
          yahoo_symbol AS "yahooSymbol",
          asset_class AS "assetClass",
          market_region AS "marketRegion",
          quote_currency AS "quoteCurrency",
          is_active AS "isActive",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM market_instruments
        ${whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : ''}
        ORDER BY is_active DESC, instrument_code ASC
        LIMIT $${values.length}
      `,
      values,
    );

    const instruments = rows.map((row) => instrumentSchema.parse(serializeRow(row)));

    return {
      count: instruments.length,
      instruments,
    };
  },
});

const getMarketPriceHistoryTool = createTool({
  id: 'get-market-price-history',
  description:
    'Fetch raw daily OHLCV price history for a single instrument from PostgreSQL market_daily_prices.',
  inputSchema: historyInputSchema,
  outputSchema: z.object({
    instrument: instrumentSchema,
    count: z.number().int(),
    prices: z.array(priceHistoryRowSchema),
  }),
  mcp: {
    annotations: {
      title: 'Get Market Price History',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  execute: async (input) => {
    const instrument = await resolveInstrument(input);
    const startDate = assertIsoDate(input.startDate, 'startDate');
    const endDate = assertIsoDate(input.endDate, 'endDate');
    assertDateRange(startDate, endDate);

    const values: unknown[] = [instrument.instrumentCode];
    const whereParts = [`p.instrument_code = $${values.length}`];

    if (startDate) {
      values.push(startDate);
      whereParts.push(`p.trade_date >= $${values.length}`);
    }

    if (endDate) {
      values.push(endDate);
      whereParts.push(`p.trade_date <= $${values.length}`);
    }

    values.push(input.limit);
    const orderBy = input.sortDirection === 'asc' ? 'ASC' : 'DESC';

    const rows = await getPostgresDb().any<Record<string, unknown>>(
      `
        SELECT
          p.trade_date AS "tradeDate",
          p.open_price AS "openPrice",
          p.high_price AS "highPrice",
          p.low_price AS "lowPrice",
          p.close_price AS "closePrice",
          p.adjusted_close_price AS "adjustedClosePrice",
          p.volume AS "volume",
          p.source_name AS "sourceName",
          p.fetched_at AS "fetchedAt"
        FROM market_daily_prices p
        WHERE ${whereParts.join(' AND ')}
        ORDER BY p.trade_date ${orderBy}
        LIMIT $${values.length}
      `,
      values,
    );

    const prices = rows.map((row) => priceHistoryRowSchema.parse(serializeRow(row)));

    return {
      instrument,
      count: prices.length,
      prices,
    };
  },
});

const getMarketChangeStatsTool = createTool({
  id: 'get-market-change-stats',
  description:
    'Fetch historical daily, 7d, 30d, 90d, and since-loaded change metrics for a single instrument from PostgreSQL.',
  inputSchema: historyInputSchema,
  outputSchema: z.object({
    instrument: instrumentSchema,
    count: z.number().int(),
    stats: z.array(changeStatsRowSchema),
  }),
  mcp: {
    annotations: {
      title: 'Get Market Change Stats',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  execute: async (input) => {
    const instrument = await resolveInstrument(input);
    const startDate = assertIsoDate(input.startDate, 'startDate');
    const endDate = assertIsoDate(input.endDate, 'endDate');
    assertDateRange(startDate, endDate);

    const values: unknown[] = [instrument.instrumentCode];
    const whereParts = [`s.instrument_code = $${values.length}`];

    if (startDate) {
      values.push(startDate);
      whereParts.push(`s.trade_date >= $${values.length}`);
    }

    if (endDate) {
      values.push(endDate);
      whereParts.push(`s.trade_date <= $${values.length}`);
    }

    values.push(input.limit);
    const orderBy = input.sortDirection === 'asc' ? 'ASC' : 'DESC';

    const rows = await getPostgresDb().any<Record<string, unknown>>(
      `
        SELECT
          s.instrument_code AS "instrumentCode",
          s.display_name AS "displayName",
          s.yahoo_symbol AS "yahooSymbol",
          s.asset_class AS "assetClass",
          s.market_region AS "marketRegion",
          s.quote_currency AS "quoteCurrency",
          i.is_active AS "isActive",
          s.trade_date AS "tradeDate",
          s.open_price AS "openPrice",
          s.high_price AS "highPrice",
          s.low_price AS "lowPrice",
          s.close_price AS "closePrice",
          s.effective_close_price AS "effectiveClosePrice",
          s.volume AS "volume",
          s.previous_close_price AS "previousClosePrice",
          s.day_change_amount AS "dayChangeAmount",
          s.day_change_pct AS "dayChangePct",
          s.change_7d_amount AS "change7dAmount",
          s.change_7d_pct AS "change7dPct",
          s.change_30d_amount AS "change30dAmount",
          s.change_30d_pct AS "change30dPct",
          s.change_90d_amount AS "change90dAmount",
          s.change_90d_pct AS "change90dPct",
          s.change_since_loaded_amount AS "changeSinceLoadedAmount",
          s.change_since_loaded_pct AS "changeSinceLoadedPct"
        FROM market_daily_change_stats s
        JOIN market_instruments i
          ON i.instrument_code = s.instrument_code
        WHERE ${whereParts.join(' AND ')}
        ORDER BY s.trade_date ${orderBy}
        LIMIT $${values.length}
      `,
      values,
    );

    const stats = rows.map((row) => changeStatsRowSchema.parse(serializeRow(row)));

    return {
      instrument,
      count: stats.length,
      stats,
    };
  },
});

const getLatestMarketSnapshotTool = createTool({
  id: 'get-latest-market-snapshot',
  description:
    'Fetch the latest available market_daily_change_stats row for each matching instrument from PostgreSQL.',
  inputSchema: latestSnapshotInputSchema,
  outputSchema: z.object({
    count: z.number().int(),
    snapshot: z.array(changeStatsRowSchema),
  }),
  mcp: {
    annotations: {
      title: 'Get Latest Market Snapshot',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  execute: async (input) => {
    const instrumentCodes = normalizeStringArray(input.instrumentCodes);
    const yahooSymbols = normalizeStringArray(input.yahooSymbols);
    const values: unknown[] = [];
    const whereParts: string[] = [];

    if (instrumentCodes) {
      values.push(instrumentCodes);
      whereParts.push(`s.instrument_code = ANY($${values.length}::text[])`);
    }

    if (yahooSymbols) {
      values.push(yahooSymbols);
      whereParts.push(`s.yahoo_symbol = ANY($${values.length}::text[])`);
    }

    const assetClass = normalizeString(input.assetClass);
    if (assetClass) {
      values.push(assetClass);
      whereParts.push(`s.asset_class = $${values.length}`);
    }

    const marketRegion = normalizeString(input.marketRegion);
    if (marketRegion) {
      values.push(marketRegion);
      whereParts.push(`s.market_region = $${values.length}`);
    }

    const quoteCurrency = normalizeString(input.quoteCurrency);
    if (quoteCurrency) {
      values.push(quoteCurrency);
      whereParts.push(`s.quote_currency = $${values.length}`);
    }

    if (input.onlyActive) {
      whereParts.push('i.is_active = TRUE');
    }

    values.push(input.limit);
    const rows = await getPostgresDb().any<Record<string, unknown>>(
      `
        WITH latest AS (
          SELECT DISTINCT ON (s.instrument_code)
            s.instrument_code AS "instrumentCode",
            s.display_name AS "displayName",
            s.yahoo_symbol AS "yahooSymbol",
            s.asset_class AS "assetClass",
            s.market_region AS "marketRegion",
            s.quote_currency AS "quoteCurrency",
            i.is_active AS "isActive",
            s.trade_date AS "tradeDate",
            s.open_price AS "openPrice",
            s.high_price AS "highPrice",
            s.low_price AS "lowPrice",
            s.close_price AS "closePrice",
            s.effective_close_price AS "effectiveClosePrice",
            s.volume AS "volume",
            s.previous_close_price AS "previousClosePrice",
            s.day_change_amount AS "dayChangeAmount",
            s.day_change_pct AS "dayChangePct",
            s.change_7d_amount AS "change7dAmount",
            s.change_7d_pct AS "change7dPct",
            s.change_30d_amount AS "change30dAmount",
            s.change_30d_pct AS "change30dPct",
            s.change_90d_amount AS "change90dAmount",
            s.change_90d_pct AS "change90dPct",
            s.change_since_loaded_amount AS "changeSinceLoadedAmount",
            s.change_since_loaded_pct AS "changeSinceLoadedPct"
          FROM market_daily_change_stats s
          JOIN market_instruments i
            ON i.instrument_code = s.instrument_code
          ${whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : ''}
          ORDER BY s.instrument_code, s.trade_date DESC
        )
        SELECT *
        FROM latest
        ORDER BY "tradeDate" DESC, "instrumentCode" ASC
        LIMIT $${values.length}
      `,
      values,
    );

    const snapshot = rows.map((row) => changeStatsRowSchema.parse(serializeRow(row)));

    return {
      count: snapshot.length,
      snapshot,
    };
  },
});

export const marketDataTools = {
  search_market_instruments: searchMarketInstrumentsTool,
  get_market_price_history: getMarketPriceHistoryTool,
  get_market_change_stats: getMarketChangeStatsTool,
  get_latest_market_snapshot: getLatestMarketSnapshotTool,
};

export const postgresMarketDataMcpServer = new MCPServer({
  id: 'postgres-market-data',
  name: 'PostgreSQL Market Data',
  version: '1.0.0',
  description:
    'Read-only MCP server for querying market instruments, daily prices, and derived change statistics from PostgreSQL.',
  instructions:
    'Use search_market_instruments to find instrument codes or Yahoo symbols. Use get_latest_market_snapshot for the newest row per instrument. Use get_market_price_history for raw daily prices and get_market_change_stats for derived return metrics.',
  tools: marketDataTools,
});
