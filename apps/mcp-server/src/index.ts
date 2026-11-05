#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createHandyServer } from "./server.js";

const server = createHandyServer();
await server.connect(new StdioServerTransport());
