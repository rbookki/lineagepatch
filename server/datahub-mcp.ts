import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface DataHubHttpMcpConfig {
  transport?: "http";
  url: string;
  token?: string;
}

export interface DataHubStdioMcpConfig {
  transport: "stdio";
  command: string;
  args?: string[];
  cwd?: string;
  env: Record<string, string>;
}

export type DataHubMcpConfig = DataHubHttpMcpConfig | DataHubStdioMcpConfig;

export class DataHubMcpClient {
  private client = new Client({ name: "lineagepatch", version: "0.1.0" });
  private transport: StreamableHTTPClientTransport | StdioClientTransport;
  private stderrTail = "";

  constructor(config: DataHubMcpConfig) {
    if (config.transport === "stdio") {
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        cwd: config.cwd,
        env: { ...getDefaultEnvironment(), ...config.env },
        stderr: "pipe",
      });
      transport.stderr?.on("data", (chunk) => {
        this.stderrTail = `${this.stderrTail}${String(chunk)}`.slice(-2_000);
      });
      this.transport = transport;
      return;
    }

    const headers: Record<string, string> = {};
    if (config.token) headers.Authorization = `Bearer ${config.token}`;

    this.transport = new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: { headers },
    });
  }

  async connect() {
    try {
      await this.client.connect(this.transport);
      return this.client.listTools();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown MCP connection error";
      const detail = this.stderrTail.trim();
      throw new Error(detail ? `${message}: ${detail}` : message);
    }
  }

  async callTool(name: string, args: Record<string, unknown>) {
    return this.client.callTool({ name, arguments: args });
  }

  async callToolJson<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const result = await this.callTool(name, args);
    const payload = result as { content?: unknown; structuredContent?: unknown };
    if (payload.structuredContent !== undefined) {
      return payload.structuredContent as T;
    }

    const content = payload.content;
    if (!Array.isArray(content)) {
      throw new Error(`DataHub MCP tool ${name} did not return JSON text content.`);
    }
    const textPart = content.find((part): part is { type: "text"; text: string } => (
      typeof part === "object" &&
      part !== null &&
      "type" in part &&
      part.type === "text" &&
      "text" in part &&
      typeof part.text === "string"
    ));
    if (!textPart) throw new Error(`DataHub MCP tool ${name} did not return JSON text content.`);
    return JSON.parse(textPart.text) as T;
  }

  async close() {
    await this.client.close();
  }
}
