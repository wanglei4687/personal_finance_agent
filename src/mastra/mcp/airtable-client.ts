import type { MCPClient } from '@mastra/mcp';

const DEFAULT_AIRTABLE_MCP_URL = 'https://mcp.airtable.com/mcp';
const DEFAULT_AIRTABLE_TIMEOUT_MS = 20_000;

type AirtableMcpConfig = {
  pat?: string;
  url: string;
};

function getAirtableMcpConfig(): AirtableMcpConfig {
  return {
    pat: process.env.AIRTABLE_PAT?.trim() || undefined,
    url: process.env.AIRTABLE_MCP_URL?.trim() || DEFAULT_AIRTABLE_MCP_URL,
  };
}

function buildAuthHeaders(pat: string): Headers {
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${pat}`);
  return headers;
}

export function hasAirtableMcpConfig(): boolean {
  return Boolean(getAirtableMcpConfig().pat);
}

export async function createAirtableMcpClientAsync(): Promise<MCPClient> {
  const config = getAirtableMcpConfig();
  const { MCPClient } = await import('@mastra/mcp');
  const pat = config.pat;

  return new MCPClient({
    id: 'airtable-mcp-client',
    servers: {
      airtable: {
        url: new URL(config.url),
        requestInit: pat
          ? {
              headers: buildAuthHeaders(pat),
            }
          : undefined,
        eventSourceInit: pat
          ? {
              fetch(input: Request | URL | string, init?: RequestInit) {
                const headers = new Headers(init?.headers);
                const authHeaders = buildAuthHeaders(pat);

                authHeaders.forEach((value, key) => {
                  headers.set(key, value);
                });

                return fetch(input, {
                  ...init,
                  headers,
                });
              },
            }
          : undefined,
        timeout: DEFAULT_AIRTABLE_TIMEOUT_MS,
        enableServerLogs: true,
      },
    },
  });
}

export async function getAirtableTools(): Promise<Record<string, unknown>> {
  const config = getAirtableMcpConfig();

  if (!config.pat) {
    return {};
  }

  try {
    const client = await createAirtableMcpClientAsync();
    return await client.listTools();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isDnsOrNetworkFailure =
      message.includes('ENOTFOUND') ||
      message.includes('fetch failed') ||
      message.includes('Could not connect to server with any available HTTP transport');

    console.warn(
      isDnsOrNetworkFailure
        ? 'Failed to initialize Airtable MCP tools due to network/DNS connectivity to the Airtable MCP server:'
        : 'Failed to initialize Airtable MCP tools:',
      error,
    );
    return {};
  }
}
