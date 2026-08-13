#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import process from "node:process";
import { AleoClient } from "./aleo-client.ts";
import { DEFAULTS } from "./common.ts";
import { registerTools } from "./tools.ts";

const endpoint = DEFAULTS.endpoint;
const network = DEFAULTS.network;

const server = new McpServer({
  name: "pactpay-aleo",
  version: "0.1.0"
});

const client = new AleoClient(endpoint, network);

registerTools(server, client);

const transport = new StdioServerTransport();
await server.connect(transport);

process.stderr.write(
  `pactpay-aleo MCP server ready (network=${network}, endpoint=${endpoint}).\n`
);
