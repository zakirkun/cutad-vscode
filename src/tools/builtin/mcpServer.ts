import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { ToolRegistry, ToolSpec, ToolContext } from "../spec";

export interface McpServerOptions {
  registry: ToolRegistry;
  workspaceRoot: string | undefined;
  /** Approval callback: must resolve before any mutating tool runs. Return false to deny. */
  approve: (request: { toolId: string; displayName: string; summary: string }) => Promise<boolean>;
  /** Exclude tools by id (e.g. delegate/skill tools that only make sense inside the chat). */
  exclude?: string[];
  version?: string;
  onLog?: (message: string) => void;
}

export function createMcpServer(options: McpServerOptions): McpServer {
  const server = new McpServer(
    { name: "cutad-ai", version: options.version ?? "0.1.0" },
    { capabilities: { tools: {} } },
  );

  const excluded = new Set(options.exclude ?? []);
  for (const spec of options.registry.all()) {
    if (excluded.has(spec.id)) continue;
    registerToolOnServer(server, spec, options);
  }

  return server;
}

function registerToolOnServer(server: McpServer, spec: ToolSpec<never>, options: McpServerOptions): void {
  const jsonSchema = z.toJSONSchema(spec.schema as z.ZodType) as {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
  const required = new Set(jsonSchema.required ?? []);
  const rawShape: Record<string, unknown> = {};
  if (jsonSchema.properties) {
    for (const [key, value] of Object.entries(jsonSchema.properties)) {
      rawShape[key] = jsonSchemaToZod(value as Record<string, unknown>, required.has(key));
    }
  }

  server.registerTool(
    spec.id,
    {
      title: spec.displayName,
      description: spec.description,
      inputSchema: rawShape as never,
      annotations: {
        readOnlyHint: spec.readOnly,
        destructiveHint: Boolean(spec.destructive),
      },
    },
    (async (input: Record<string, unknown>) => {
      const summary = summarize(input);
      options.onLog?.(`[mcp-server] call ${spec.id} (${summary})`);

      if (!spec.readOnly) {
        const approved = await options.approve({
          toolId: spec.id,
          displayName: spec.displayName,
          summary,
        });
        if (!approved) {
          return {
            content: [
              {
                type: "text" as const,
                text: "User denied this action in VS Code. Do not retry; explain what you need instead.",
              },
            ],
            isError: true,
          };
        }
      }

      const ctx: ToolContext = {
        workspaceRoot: options.workspaceRoot,
        token: { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => undefined }) } as never,
        approve: async () => "allow",
        log: (message: string) => options.onLog?.(`[mcp-server] ${message}`),
      };

      try {
        const result = await spec.execute(input as never, ctx);
        return {
          content: [{ type: "text" as const, text: result.content }],
          isError: !result.ok,
        };
      } catch (err) {
        return {
          content: [
            { type: "text" as const, text: `Tool crashed: ${err instanceof Error ? err.message : String(err)}` },
          ],
          isError: true,
        };
      }
    }) as never,
  );
}

function summarize(input: Record<string, unknown>): string {
  if (typeof input.path === "string") {
    const extra = typeof input.command === "string" ? ` — ${String(input.command).slice(0, 80)}` : "";
    return `${input.path}${extra}`;
  }
  if (typeof input.command === "string") return String(input.command).slice(0, 120);
  if (typeof input.query === "string") return `"${input.query}"`;
  return JSON.stringify(input).slice(0, 120);
}

function jsonSchemaToZod(schema: Record<string, unknown>, isRequired: boolean): z.ZodTypeAny {
  const description = typeof schema.description === "string" ? schema.description : undefined;
  const type = schema.type as string | undefined;

  let zodType: z.ZodTypeAny;
  switch (type) {
    case "number":
    case "integer":
      zodType = type === "integer" ? z.number().int() : z.number();
      break;
    case "boolean":
      zodType = z.boolean();
      break;
    case "array": {
      const items = schema.items as Record<string, unknown> | undefined;
      zodType = z.array(items ? jsonSchemaToZod(items, true) : z.unknown());
      break;
    }
    case "object":
      zodType = z.record(z.string(), z.unknown());
      break;
    default:
      zodType = z.string();
  }

  const withDescription = description ? zodType.describe(description) : zodType;
  return isRequired ? withDescription : withDescription.optional();
}

export async function serveStdio(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export const MCP_SERVER_EXCLUDE = [
  "delegate_to_specialist",
  "create_skill",
  "delete_skill",
  "launch_debug",
  "set_breakpoint",
  "remove_breakpoint",
];
