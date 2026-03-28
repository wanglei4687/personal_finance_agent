
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { Observability, DefaultExporter, SensitiveDataFilter } from '@mastra/observability';
import { financialCheckInWorkflow } from './workflows/financial-check-in-workflow';
import { personalFinanceAgent } from './agents/personal-finance-agent';
import { ensureStoredPersonalFinanceAgent } from './editor-sync';
import { storage } from './storage';

const port = Number(process.env.PORT ?? 4111);
const host = process.env.MASTRA_HOST ?? '0.0.0.0';
const observabilityEnabled = process.env.MASTRA_OBSERVABILITY_ENABLED !== 'false';

export const mastra = new Mastra({
  server: {
    host,
    port,
    studioBase: '/studio',
  },
  workflows: { financialCheckInWorkflow },
  agents: { 'personal-finance-agent': personalFinanceAgent },
  storage,
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'debug',
  }),
  observability: observabilityEnabled
    ? new Observability({
        configs: {
          default: {
            serviceName: 'mastra',
            exporters: [
              new DefaultExporter(), // Persists traces to storage for Mastra Studio
            ],
            spanOutputProcessors: [
              new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys
            ],
          },
        },
      })
    : undefined,
});

await ensureStoredPersonalFinanceAgent();
