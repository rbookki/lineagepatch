import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import type { DataHubMcpConfig } from "./datahub-mcp.js";

interface DataHubEnvFile {
  gms?: {
    server?: unknown;
    token?: unknown;
  };
}

export interface ResolvedDataHubConnection {
  config: DataHubMcpConfig;
  label: string;
  transport: "http" | "stdio";
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readLocalDataHubConfig() {
  try {
    const configPath = path.join(os.homedir(), ".datahubenv");
    return parse(fs.readFileSync(configPath, "utf8")) as DataHubEnvFile;
  } catch {
    return undefined;
  }
}

export function resolveDataHubConnection(): ResolvedDataHubConnection | undefined {
  const remoteUrl = nonEmptyString(process.env.DATAHUB_MCP_URL);
  if (remoteUrl) {
    return {
      config: {
        transport: "http",
        url: remoteUrl,
        token: nonEmptyString(process.env.DATAHUB_MCP_TOKEN),
      },
      label: "DataHub MCP HTTP",
      transport: "http",
    };
  }

  const localConfig = readLocalDataHubConfig();
  const command = nonEmptyString(process.env.DATAHUB_MCP_COMMAND)
    ?? path.join(projectRoot, ".venv-datahub", "bin", "mcp-server-datahub");
  const gmsUrl = nonEmptyString(process.env.DATAHUB_GMS_URL)
    ?? nonEmptyString(localConfig?.gms?.server);
  const gmsToken = nonEmptyString(process.env.DATAHUB_GMS_TOKEN)
    ?? nonEmptyString(localConfig?.gms?.token);

  if (!fs.existsSync(command) || !gmsUrl || !gmsToken) return undefined;

  return {
    config: {
      transport: "stdio",
      command,
      cwd: projectRoot,
      env: {
        DATAHUB_GMS_URL: gmsUrl,
        DATAHUB_GMS_TOKEN: gmsToken,
        DATAHUB_TELEMETRY_ENABLED: "false",
        TOOLS_IS_MUTATION_ENABLED: process.env.DATAHUB_MCP_MUTATIONS === "true" ? "true" : "false",
        TOOLS_IS_USER_ENABLED: "false",
      },
    },
    label: "DataHub Core MCP",
    transport: "stdio",
  };
}
