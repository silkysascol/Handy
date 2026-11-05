import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createHandyServer } from "../src/server.js";

describe("Handy MCP server", () => {
  it("expone las herramientas y diseña un gabinete", async () => {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const server = createHandyServer();
    await server.connect(serverT);
    const client = new Client({ name: "test", version: "0.0.0" });
    await client.connect(clientT);

    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name).sort()).toEqual(["cutlist", "design_cabinet", "search_prices"]);

    const res = await client.callTool({ name: "design_cabinet", arguments: { width: 800, height: 2000, depth: 500, shelves: 3, doors: 2 } });
    const text = (res.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("Gabinete 800 x 2000 x 500 mm");
    expect(text).toContain("Cotización aprox.");
    await client.close();
  });
});
