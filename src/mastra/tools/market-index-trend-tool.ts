import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getPostgresDb } from '../storage';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const trendDirectionSchema = z.enum([
  'strong_up',
  'up',
  'sideways',
  'down',
  'strong_down',
]);

const trendPointSchema = z.object({
  tradeDate: z.string(),
  closePrice: z.number(),
  normalizedValue: z.number(),
});

const instrumentTrendSchema = z.object({
  instrumentCode: z.string(),
  displayName: z.string(),
  yahooSymbol: z.string(),
  assetClass: z.string(),
  marketRegion: z.string(),
  quoteCurrency: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  observationCount: z.number().int().min(1),
  startPrice: z.number(),
  latestPrice: z.number(),
  normalizedLatestValue: z.number(),
  totalReturnPct: z.number(),
  annualizedReturnPct: z.number().nullable(),
  maxDrawdownPct: z.number(),
  positiveSessionRatio: z.number().nullable(),
  slopePerSessionPct: z.number(),
  latestVs20SessionAveragePct: z.number().nullable(),
  trendDirection: trendDirectionSchema,
  series: z.array(trendPointSchema),
});

const marketTrendInputSchema = z.object({
  instrumentCodes: z.array(z.string().trim().min(1)).optional(),
  yahooSymbols: z.array(z.string().trim().min(1)).optional(),
  lookbackDays: z.number().int().min(7).max(3650).optional().default(180),
  endDate: z.string().optional(),
  onlyActive: z.boolean().optional().default(true),
  includeSeries: z.boolean().optional().default(true),
});

const marketTrendOutputSchema = z.object({
  summary: z.object({
    lookbackDays: z.number().int(),
    endDate: z.string(),
    instrumentCount: z.number().int(),
    strongestInstrumentCode: z.string().nullable(),
    weakestInstrumentCode: z.string().nullable(),
    averageReturnPct: z.number().nullable(),
  }),
  rankings: z.array(
    z.object({
      instrumentCode: z.string(),
      displayName: z.string(),
      totalReturnPct: z.number(),
      trendDirection: trendDirectionSchema,
    }),
  ),
  trends: z.array(instrumentTrendSchema),
});

type TrendPoint = z.infer<typeof trendPointSchema>;
type TrendDirection = z.infer<typeof trendDirectionSchema>;

type PriceRow = {
  instrumentCode: string;
  displayName: string;
  yahooSymbol: string;
  assetClass: string;
  marketRegion: string;
  quoteCurrency: string;
  tradeDate: string;
  closePrice: number;
};

function normalizeStringArray(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
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

function roundMetric(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function calculateMaxDrawdownPct(series: TrendPoint[]): number {
  let peak = series[0]?.normalizedValue ?? 100;
  let maxDrawdownPct = 0;

  for (const point of series) {
    peak = Math.max(peak, point.normalizedValue);

    if (peak <= 0) {
      continue;
    }

    const drawdownPct = ((point.normalizedValue / peak) - 1) * 100;
    maxDrawdownPct = Math.min(maxDrawdownPct, drawdownPct);
  }

  return roundMetric(maxDrawdownPct);
}

function calculatePositiveSessionRatio(series: TrendPoint[]): number | null {
  if (series.length < 2) {
    return null;
  }

  let positiveSessions = 0;

  for (let index = 1; index < series.length; index += 1) {
    if (series[index]!.closePrice > series[index - 1]!.closePrice) {
      positiveSessions += 1;
    }
  }

  return roundMetric(positiveSessions / (series.length - 1));
}

function calculateSlopePerSessionPct(series: TrendPoint[]): number {
  if (series.length < 2) {
    return 0;
  }

  const xMean = (series.length - 1) / 2;
  const yMean =
    series.reduce((total, point) => total + point.normalizedValue, 0) / series.length;

  let numerator = 0;
  let denominator = 0;

  for (let index = 0; index < series.length; index += 1) {
    const xDelta = index - xMean;
    const yDelta = series[index]!.normalizedValue - yMean;

    numerator += xDelta * yDelta;
    denominator += xDelta * xDelta;
  }

  if (denominator === 0) {
    return 0;
  }

  return roundMetric(numerator / denominator);
}

function calculateLatestVs20SessionAveragePct(series: TrendPoint[]): number | null {
  if (series.length < 20) {
    return null;
  }

  const last20 = series.slice(-20);
  const average =
    last20.reduce((total, point) => total + point.closePrice, 0) / last20.length;

  if (average === 0) {
    return null;
  }

  return roundMetric(((series.at(-1)!.closePrice / average) - 1) * 100);
}

function calculateAnnualizedReturnPct(
  startPrice: number,
  latestPrice: number,
  startDate: string,
  endDate: string,
): number | null {
  const elapsedMs = Date.parse(endDate) - Date.parse(startDate);

  if (elapsedMs <= 0 || startPrice <= 0) {
    return null;
  }

  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);

  if (elapsedDays <= 0) {
    return null;
  }

  return roundMetric((Math.pow(latestPrice / startPrice, 365 / elapsedDays) - 1) * 100);
}

function classifyTrend(input: {
  totalReturnPct: number;
  slopePerSessionPct: number;
  latestVs20SessionAveragePct: number | null;
}): TrendDirection {
  const { totalReturnPct, slopePerSessionPct, latestVs20SessionAveragePct } = input;
  const averageSignal = latestVs20SessionAveragePct ?? 0;

  if (totalReturnPct >= 15 && slopePerSessionPct >= 0.12 && averageSignal >= 1) {
    return 'strong_up';
  }

  if (totalReturnPct >= 4 && slopePerSessionPct > 0) {
    return 'up';
  }

  if (totalReturnPct <= -15 && slopePerSessionPct <= -0.12 && averageSignal <= -1) {
    return 'strong_down';
  }

  if (totalReturnPct <= -4 && slopePerSessionPct < 0) {
    return 'down';
  }

  return 'sideways';
}

function buildTrendSeries(rows: PriceRow[]): TrendPoint[] {
  const startPrice = rows[0]!.closePrice;

  return rows.map((row) => ({
    tradeDate: row.tradeDate,
    closePrice: roundMetric(row.closePrice, 6),
    normalizedValue: roundMetric((row.closePrice / startPrice) * 100),
  }));
}

export const marketIndexTrendTool = createTool({
  id: 'calculate-market-index-trends',
  description:
    'Calculate normalized trend, return, drawdown, and momentum metrics for one or more market indices from PostgreSQL historical prices.',
  inputSchema: marketTrendInputSchema,
  outputSchema: marketTrendOutputSchema,
  mcp: {
    annotations: {
      title: 'Calculate Market Index Trends',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  execute: async (input) => {
    const lookbackDays = input.lookbackDays ?? 180;
    const onlyActive = input.onlyActive ?? true;
    const includeSeries = input.includeSeries ?? true;
    const instrumentCodes = normalizeStringArray(input.instrumentCodes);
    const yahooSymbols = normalizeStringArray(input.yahooSymbols);
    const endDate = assertIsoDate(input.endDate, 'endDate');

    if (instrumentCodes.length === 0 && yahooSymbols.length === 0) {
      throw new Error('Provide instrumentCodes or yahooSymbols');
    }

    const identifierValues: unknown[] = [];
    const identifierClauses: string[] = [];

    if (instrumentCodes.length > 0) {
      identifierValues.push(instrumentCodes);
      identifierClauses.push(`instrument_code = ANY($${identifierValues.length}::text[])`);
    }

    if (yahooSymbols.length > 0) {
      identifierValues.push(yahooSymbols);
      identifierClauses.push(`yahoo_symbol = ANY($${identifierValues.length}::text[])`);
    }

    if (onlyActive) {
      identifierClauses.push('is_active = TRUE');
    }

    const matchedInstruments = await getPostgresDb().any<{
      instrumentCode: string;
    }>(
      `
        SELECT instrument_code AS "instrumentCode"
        FROM market_instruments
        WHERE ${identifierClauses.join(' AND ')}
        ORDER BY instrument_code ASC
      `,
      identifierValues,
    );

    const matchedInstrumentCodes = matchedInstruments.map((row) => row.instrumentCode);

    if (matchedInstrumentCodes.length === 0) {
      throw new Error('No matching instruments found');
    }

    const endDateResult = await getPostgresDb().oneOrNone<{ endDate: string }>(
      `
        SELECT MAX(trade_date)::text AS "endDate"
        FROM market_daily_prices
        WHERE instrument_code = ANY($1::text[])
        ${endDate ? 'AND trade_date <= $2::date' : ''}
      `,
      endDate ? [matchedInstrumentCodes, endDate] : [matchedInstrumentCodes],
    );

    const effectiveEndDate = endDateResult?.endDate;

    if (!effectiveEndDate) {
      throw new Error('No price history found for the selected instruments');
    }

    const rows = await getPostgresDb().any<PriceRow>(
      `
        SELECT
          i.instrument_code AS "instrumentCode",
          i.display_name AS "displayName",
          i.yahoo_symbol AS "yahooSymbol",
          i.asset_class AS "assetClass",
          i.market_region AS "marketRegion",
          i.quote_currency AS "quoteCurrency",
          p.trade_date::text AS "tradeDate",
          COALESCE(p.adjusted_close_price, p.close_price)::float8 AS "closePrice"
        FROM market_daily_prices p
        JOIN market_instruments i
          ON i.instrument_code = p.instrument_code
        WHERE p.instrument_code = ANY($1::text[])
          AND p.trade_date <= $2::date
          AND p.trade_date >= ($2::date - ($3 * INTERVAL '1 day'))
        ORDER BY p.instrument_code ASC, p.trade_date ASC
      `,
      [matchedInstrumentCodes, effectiveEndDate, lookbackDays],
    );

    if (rows.length === 0) {
      throw new Error('No price history found inside the requested lookback window');
    }

    const groupedRows = new Map<string, PriceRow[]>();

    for (const row of rows) {
      const existingRows = groupedRows.get(row.instrumentCode) ?? [];
      existingRows.push(row);
      groupedRows.set(row.instrumentCode, existingRows);
    }

    const trends = Array.from(groupedRows.values())
      .map((instrumentRows) => {
        const firstRow = instrumentRows[0]!;
        const lastRow = instrumentRows.at(-1)!;
        const series = buildTrendSeries(instrumentRows);
        const startPrice = firstRow.closePrice;
        const latestPrice = lastRow.closePrice;
        const totalReturnPct = roundMetric(((latestPrice / startPrice) - 1) * 100);
        const slopePerSessionPct = calculateSlopePerSessionPct(series);
        const latestVs20SessionAveragePct = calculateLatestVs20SessionAveragePct(series);
        const trendDirection = classifyTrend({
          totalReturnPct,
          slopePerSessionPct,
          latestVs20SessionAveragePct,
        });

        return {
          instrumentCode: firstRow.instrumentCode,
          displayName: firstRow.displayName,
          yahooSymbol: firstRow.yahooSymbol,
          assetClass: firstRow.assetClass,
          marketRegion: firstRow.marketRegion,
          quoteCurrency: firstRow.quoteCurrency,
          startDate: firstRow.tradeDate,
          endDate: lastRow.tradeDate,
          observationCount: instrumentRows.length,
          startPrice: roundMetric(startPrice, 6),
          latestPrice: roundMetric(latestPrice, 6),
          normalizedLatestValue: roundMetric(series.at(-1)!.normalizedValue),
          totalReturnPct,
          annualizedReturnPct: calculateAnnualizedReturnPct(
            startPrice,
            latestPrice,
            firstRow.tradeDate,
            lastRow.tradeDate,
          ),
          maxDrawdownPct: calculateMaxDrawdownPct(series),
          positiveSessionRatio: calculatePositiveSessionRatio(series),
          slopePerSessionPct,
          latestVs20SessionAveragePct,
          trendDirection,
          series: includeSeries ? series : [],
        };
      })
      .sort((left, right) => right.totalReturnPct - left.totalReturnPct);

    const strongestInstrumentCode = trends[0]?.instrumentCode ?? null;
    const weakestInstrumentCode = trends.at(-1)?.instrumentCode ?? null;
    const averageReturnPct =
      trends.length > 0
        ? roundMetric(
            trends.reduce((total, trend) => total + trend.totalReturnPct, 0) / trends.length,
          )
        : null;

    return {
      summary: {
        lookbackDays,
        endDate: effectiveEndDate,
        instrumentCount: trends.length,
        strongestInstrumentCode,
        weakestInstrumentCode,
        averageReturnPct,
      },
      rankings: trends.map((trend) => ({
        instrumentCode: trend.instrumentCode,
        displayName: trend.displayName,
        totalReturnPct: trend.totalReturnPct,
        trendDirection: trend.trendDirection,
      })),
      trends,
    };
  },
});
