import { FilesystemStore, MastraCompositeStore } from '@mastra/core/storage';
import { Memory } from '@mastra/memory';
import { MemoryPG, ObservabilityPG, PostgresStore, ScoresPG, WorkflowsPG } from '@mastra/pg';

declare global {
  var mastraPostgresStore: PostgresStore | undefined;
  var mastraStorage: MastraCompositeStore | undefined;
  var personalFinanceMemory: Memory | undefined;
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not defined`);
  }

  return value;
}

function getPostgresConnectionString(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const user = encodeURIComponent(requireEnv('POSTGRES_USER'));
  const password = encodeURIComponent(requireEnv('POSTGRES_PASSWORD'));
  const host = process.env.POSTGRES_HOST ?? 'localhost';
  const port = process.env.POSTGRES_PORT ?? '5432';
  const database = requireEnv('POSTGRES_DB');

  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

function getPostgresStore(): PostgresStore {
  if (!globalThis.mastraPostgresStore) {
    globalThis.mastraPostgresStore = new PostgresStore({
      id: 'mastra-postgres',
      connectionString: getPostgresConnectionString(),
    });
  }

  return globalThis.mastraPostgresStore;
}

function getCompositeStorage(): MastraCompositeStore {
  if (!globalThis.mastraStorage) {
    const postgresStore = getPostgresStore();
    const sharedPool = postgresStore.pool;

    globalThis.mastraStorage = new MastraCompositeStore({
      id: 'mastra-storage',
      default: postgresStore,
      editor: new FilesystemStore({ dir: '.mastra-storage' }),
      domains: {
        memory: new MemoryPG({ pool: sharedPool }),
        workflows: new WorkflowsPG({ pool: sharedPool }),
        observability: new ObservabilityPG({ pool: sharedPool }),
        scores: new ScoresPG({ pool: sharedPool }),
      },
    });
  }

  return globalThis.mastraStorage;
}

export const storage = getCompositeStorage();

export function getPersonalFinanceMemory(): Memory {
  if (!globalThis.personalFinanceMemory) {
    globalThis.personalFinanceMemory = new Memory({
      storage,
      options: {
        lastMessages: 10,
      },
    });
  }

  return globalThis.personalFinanceMemory;
}
