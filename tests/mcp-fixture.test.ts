import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createFixtureMcpServer } from "../server/mcp-fixture.js";
import { incidents } from "../server/demo-data.js";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe("DataHub-compatible MCP fixture", () => {
  it("negotiates MCP and serves the required DataHub tools", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createFixtureMcpServer();
    const client = new Client({ name: "lineagepatch-test", version: "0.1.0" });
    cleanups.push(async () => {
      await client.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "get_entities",
      "list_schema_fields",
      "get_lineage",
      "get_dataset_queries",
      "save_document",
    ]));

    const lineage = await client.callTool({
      name: "get_lineage",
      arguments: {
        urn: incidents[0].assetUrn,
        upstream: false,
        max_hops: 3,
        max_results: 30,
      },
    });
    const content = (lineage as { content: Array<{ type: string; text?: string }> }).content;
    const text = content.find((part) => part.type === "text")?.text;
    const payload = JSON.parse(text ?? "{}");

    expect(payload.direction).toBe("DOWNSTREAM");
    expect(payload.nodes).toHaveLength(6);
    expect(payload.explanation).toContain("customer_email");
  });
});
