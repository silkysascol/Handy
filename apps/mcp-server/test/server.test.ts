import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHandyServer } from "../src/server.js";
import { WorldStore } from "../src/world-tools.js";

describe("Handy MCP server", () => {
  it("expone las herramientas y diseña un gabinete", async () => {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const server = createHandyServer();
    await server.connect(serverT);
    const client = new Client({ name: "test", version: "0.0.0" });
    await client.connect(clientT);

    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name).filter((n) => !n.startsWith("world_")).sort()).toEqual(["check_collisions", "cutlist", "design_cabinet", "search_prices"]);

    const res = await client.callTool({ name: "design_cabinet", arguments: { width: 800, height: 2000, depth: 500, shelves: 3, doors: 2 } });
    const text = (res.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("Gabinete 800 x 2000 x 500 mm");
    expect(text).toContain("Cotización aprox.");

    const col = await client.callTool({ name: "check_collisions", arguments: { width: 600, height: 700, depth: 350, doors: 1, obstacles: [{ id: "w", name: "muro izquierdo", min: [-200, 0, -1000], max: [0, 2600, 3000] }] } });
    expect((col.content as Array<{ type: string; text: string }>)[0].text).toContain("muro izquierdo");
    await client.close();
  });

  it("la IA puede crear el mundo, colocar muebles, revisar, cotizar y exportar", async () => {
    const dir = mkdtempSync(join(tmpdir(), "handy-"));
    const store = new WorldStore(join(dir, "casa.world.json"));
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const server = createHandyServer(undefined, store);
    await server.connect(serverT);
    const client = new Client({ name: "test", version: "0.0.0" });
    await client.connect(clientT);
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const r = await client.callTool({ name, arguments: args });
      return { text: (r.content as Array<{ text: string }>)[0].text, isError: r.isError, data: r.structuredContent as Record<string, any> };
    };

    expect((await call("world_describe")).isError).toBe(true);
    await call("world_create", { name: "Mi casa" });
    expect((await call("world_create", { name: "Otra" })).isError).toBe(true);
    await call("world_add_room", { name: "Dormitorio", width: 3600, depth: 3200 });
    await call("world_add_opening", { roomId: "dormitorio", wall: "south", type: "door", offset: 200, width: 800, height: 2050 });

    const runs = await call("world_free_runs", { roomId: "dormitorio", height: 2000 });
    expect(runs.text).toContain("muro sur: 1000–3600");

    const placed = await call("world_place_cabinet", { roomId: "dormitorio", wall: "east", offset: 0, name: "Armario", width: 600, height: 2000, depth: 500, doors: 1 });
    expect(placed.text).toContain("choca con muro norte");
    await call("world_remove_item", { itemId: "armario" });
    const ok = await call("world_place_cabinet", { roomId: "dormitorio", wall: "east", offset: 1000, name: "Armario", width: 800, height: 2000, depth: 500, doors: 2, shelves: 3 });
    expect(ok.data.issues).toEqual([]);

    const moved = await call("world_command", { itemId: "armario", text: "muévelo 20 cm a la derecha" });
    expect(moved.text).toContain("de 1200 a 2000");
    const door = await call("world_command", { roomId: "dormitorio", wall: "north", text: "pon una ventana de 120 x 100 a 1 m de la izquierda" });
    expect(door.text).toContain("Ventana de 1200 x 1000");
    expect((await call("world_command", { itemId: "armario", text: "hazlo volar" })).isError).toBe(true);
    const upd = await call("world_update_item", { itemId: "armario", shelves: 5, width: 760 });
    expect(upd.data.item.params).toMatchObject({ shelves: 5, width: 760, height: 2000 });

    expect((await call("world_describe")).text).toContain("Armario (id: armario)");
    expect((await call("world_check")).text).toContain("Sin avisos");
    const quote = await call("world_quote");
    expect(quote.data.subtotal).toBeGreaterThan(50);
    expect(quote.data.missingCount).toBe(0);

    const cut = await call("world_cutplan");
    expect(cut.text).toMatch(/tablero\(s\) de Melamina 18 mm Blanco/);
    expect(readFileSync(cut.data.html, "utf8")).toContain("Plano de corte");
    expect(readFileSync(cut.data.csv, "utf8").split("\n")[0]).toContain("Pieza;Cantidad");

    const exported = await call("world_export_gltf");
    expect(existsSync(exported.data.path)).toBe(true);
    expect(JSON.parse(readFileSync(exported.data.path, "utf8")).asset.version).toBe("2.0");
    await client.close();
  });
});
