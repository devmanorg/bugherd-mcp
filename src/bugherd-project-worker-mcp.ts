#!/usr/bin/env node
// @ts-nocheck
import crypto from "crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "http";
import { z } from "zod/v4";
import { createComment, getColumnMappings, getTaskByLocalId, listArchivedTasks, listColumns, listComments, listFeedbackTasks, listTaskboardTasks, listTasks, updateTask, } from "./api/client.js";
import { getPriorityName } from "./types/bugherd.js";
import { loadEnvOrExit, truncate } from "./config.js";
const env = loadEnvOrExit();
function applyAgentSignature(text) {
    if (!env.agentSignature)
        return text;
    const trimmed = text.trimEnd();
    const sig = env.agentSignature.trim();
    if (trimmed.endsWith(sig))
        return text;
    return trimmed + env.agentSignatureSeparator + env.agentSignature;
}
function compareDateString(a, b) {
    // ISO timestamps compare lexicographically too, but Date.parse is safer
    return Date.parse(a) - Date.parse(b);
}
function sortTasks(tasks, mode) {
    if (mode === "api")
        return tasks;
    const sorted = [...tasks];
    sorted.sort((left, right) => {
        switch (mode) {
            case "updated_at_desc": {
                const diff = compareDateString(right.updated_at, left.updated_at);
                return diff !== 0 ? diff : right.id - left.id;
            }
            case "updated_at_asc": {
                const diff = compareDateString(left.updated_at, right.updated_at);
                return diff !== 0 ? diff : left.id - right.id;
            }
            case "created_at_desc": {
                const diff = compareDateString(right.created_at, left.created_at);
                return diff !== 0 ? diff : right.id - left.id;
            }
            case "created_at_asc": {
                const diff = compareDateString(left.created_at, right.created_at);
                return diff !== 0 ? diff : left.id - right.id;
            }
            case "local_task_id_desc":
                return right.local_task_id !== left.local_task_id
                    ? right.local_task_id - left.local_task_id
                    : right.id - left.id;
            case "local_task_id_asc":
                return left.local_task_id !== right.local_task_id
                    ? left.local_task_id - right.local_task_id
                    : left.id - right.id;
        }
    });
    return sorted;
}
function encodePageCursor(value) {
    return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}
function decodePageCursor(cursor) {
    const numeric =
        typeof cursor === "number"
            ? cursor
            : typeof cursor === "string" && /^\d+$/.test(cursor)
                ? Number(cursor)
                : null;
    if (numeric !== null) {
        return { page: numeric };
    }
    try {
        const raw = Buffer.from(cursor, "base64url").toString("utf8");
        const parsed = JSON.parse(raw);
        return z.object({ page: z.number().int().positive() }).parse(parsed);
    }
    catch {
        throw new Error(
            "Invalid cursor. Use the cursor returned by the server, or pass a numeric page (e.g. 1).",
        );
    }
}
function encodeTextCursor(value) {
    return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}
function decodeTextCursor(cursor) {
    const numeric =
        typeof cursor === "number"
            ? cursor
            : typeof cursor === "string" && /^\d+$/.test(cursor)
                ? Number(cursor)
                : null;
    if (numeric !== null) {
        return { offset: numeric };
    }
    try {
        const raw = Buffer.from(cursor, "base64url").toString("utf8");
        const parsed = JSON.parse(raw);
        return z.object({ offset: z.number().int().nonnegative() }).parse(parsed);
    }
    catch {
        throw new Error(
            "Invalid cursor. Use next_cursor returned by the server, or pass a numeric offset (e.g. 0).",
        );
    }
}
function textChunk(text, offset, maxChars) {
    const start = Math.max(0, offset);
    const end = Math.min(text.length, start + maxChars);
    const chunk = text.substring(start, end);
    const nextOffset = end < text.length ? end : null;
    return {
        chunk,
        offset: start,
        nextOffset,
        nextCursor: nextOffset === null ? null : encodeTextCursor({ offset: nextOffset }),
    };
}
function formatColumnLine(col, isActive) {
    const pos = col.position ?? "n/a";
    const active = isActive ? " (active)" : "";
    return `- ${col.name} (id: ${col.id}, pos: ${pos})${active}`;
}
const server = new Server({
    name: "bugherd-project-worker-mcp",
    version: "0.2.0",
}, {
    capabilities: {
        tools: {},
        resources: {},
    },
});
// Schemas
const PageCursorSchema = z
    .string()
    .min(1)
    .describe("Opaque cursor returned by list tools");
const TextCursorSchema = z
    .string()
    .min(1)
    .describe("Opaque cursor returned by text chunk tools");
const ListTasksSchema = z.object({
    scope: z
        .enum(["taskboard", "all", "feedback", "archived"])
        .optional()
        .describe("Which BugHerd endpoint to use"),
    sort: z
        .enum([
        "api",
        "updated_at_desc",
        "updated_at_asc",
        "created_at_desc",
        "created_at_asc",
        "local_task_id_desc",
        "local_task_id_asc",
    ])
        .describe("Sort mode applied within the page"),
    page: z.number().int().positive().optional().describe("1-based page"),
    cursor: z
        .union([PageCursorSchema, z.number().int().positive(), z.string().regex(/^\d+$/)])
        .optional(),
    status: z
        .string()
        .optional()
        .describe("Optional status filter by column name"),
    tag: z.string().optional().describe("Optional tag filter"),
    priority: z
        .enum(["critical", "important", "normal", "minor"])
        .optional()
        .describe("Optional priority filter"),
});
const LocalTaskSchema = z.object({
    local_task_id: z.number().int().positive().describe("Local task id (#123)"),
});
const TaskDescriptionMoreSchema = z.object({
    local_task_id: z.number().int().positive().describe("Local task id (#123)"),
    cursor: z
        .union([TextCursorSchema, z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
        .optional(),
});
const MoveTaskSchema = z.object({
    local_task_id: z.number().int().positive().describe("Local task id (#123)"),
    to_column_id: z.number().int().positive().describe("Target column id"),
});
const AddCommentSchema = z.object({
    local_task_id: z.number().int().positive().describe("Local task id (#123)"),
    text: z.string().min(1).describe("Comment text"),
});
const ListCommentsSchema = z.object({
    local_task_id: z.number().int().positive().describe("Local task id (#123)"),
    page: z.number().int().positive().optional().describe("1-based page"),
    cursor: z
        .union([PageCursorSchema, z.number().int().positive(), z.string().regex(/^\d+$/)])
        .optional(),
});
const CommentTextMoreSchema = z.object({
    local_task_id: z.number().int().positive().describe("Local task id (#123)"),
    comment_id: z.number().int().positive().describe("Comment id"),
    cursor: z
        .union([TextCursorSchema, z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
        .optional(),
});
// Tool definitions
const TOOLS = [
    {
        name: "columns_list",
        description: "List project columns (statuses) with ids.",
        inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
        name: "tasks_list",
        description: "List tasks for the configured project. Returns up to page_size items with pagination.",
        inputSchema: {
            type: "object",
            properties: {
                scope: { type: "string", enum: ["taskboard", "all", "feedback", "archived"] },
                sort: {
                    type: "string",
                    enum: [
                        "api",
                        "updated_at_desc",
                        "updated_at_asc",
                        "created_at_desc",
                        "created_at_asc",
                        "local_task_id_desc",
                        "local_task_id_asc",
                    ],
                    description: "Sort mode applied within the page",
                },
                page: { type: "number", description: "1-based page" },
                cursor: { type: ["string", "number"], description: "Opaque cursor from previous response (or numeric page)" },
                status: { type: "string", description: "Optional status filter by column name" },
                tag: { type: "string", description: "Optional tag filter" },
                priority: {
                    type: "string",
                    enum: ["critical", "important", "normal", "minor"],
                    description: "Optional priority filter",
                },
            },
            required: ["sort"],
        },
    },
    {
        name: "task_get",
        description: "Get detailed task info by local id (#123). Description is truncated.",
        inputSchema: {
            type: "object",
            properties: { local_task_id: { type: "number" } },
            required: ["local_task_id"],
        },
    },
    {
        name: "task_description_more",
        description: "Aux tool: read long task description in chunks. Returns next_cursor when more is available.",
        inputSchema: {
            type: "object",
            properties: {
                local_task_id: { type: "number" },
                cursor: { type: ["string", "number"], description: "Opaque cursor from previous chunk (or numeric offset)" },
            },
            required: ["local_task_id"],
        },
    },
    {
        name: "task_move_status",
        description: "Move a task to a different column by column id.",
        inputSchema: {
            type: "object",
            properties: {
                local_task_id: { type: "number" },
                to_column_id: { type: "number" },
            },
            required: ["local_task_id", "to_column_id"],
        },
    },
    {
        name: "comments_list",
        description: "List comments for a task. Returns up to page_size items.",
        inputSchema: {
            type: "object",
            properties: {
                local_task_id: { type: "number" },
                page: { type: "number" },
                cursor: { type: ["string", "number"], description: "Opaque cursor from previous response (or numeric page)" },
            },
            required: ["local_task_id"],
        },
    },
    {
        name: "comment_text_more",
        description: "Aux tool: read a long comment text in chunks. Returns next_cursor when more is available.",
        inputSchema: {
            type: "object",
            properties: {
                local_task_id: { type: "number" },
                comment_id: { type: "number" },
                cursor: { type: ["string", "number"], description: "Opaque cursor from previous chunk (or numeric offset)" },
            },
            required: ["local_task_id", "comment_id"],
        },
    },
    {
        name: "comment_add",
        description: "Add a comment to a task using the configured bot user.",
        inputSchema: {
            type: "object",
            properties: {
                local_task_id: { type: "number" },
                text: { type: "string" },
            },
            required: ["local_task_id", "text"],
        },
    },
];
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
});
server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
        resources: [
            {
                uri: "bugherd://columns",
                name: "BugHerd project columns",
                mimeType: "application/json",
                description: "Columns (statuses) for the configured project",
            },
        ],
    };
});
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    if (uri === "bugherd://columns") {
        const result = await listColumns(env.projectId);
        const cols = result.columns
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map((c) => ({ id: c.id, name: c.name, position: c.position ?? null }));
        return {
            contents: [
                {
                    uri,
                    mimeType: "application/json",
                    text: JSON.stringify({
                        project_id: env.projectId,
                        active_column_ids: env.activeColumnIds,
                        columns: cols,
                    }, null, 2),
                },
            ],
        };
    }
    throw new Error(`Unknown resource: ${uri}`);
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case "columns_list": {
                const result = await listColumns(env.projectId);
                const cols = result.columns.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
                const activeSet = env.activeColumnIds
                    ? new Set(env.activeColumnIds)
                    : null;
                const lines = cols.map((c) => formatColumnLine(c, activeSet ? activeSet.has(c.id) : false));
                const hint = env.activeColumnIds
                    ? `\n\nActive columns hint: ${env.activeColumnIds.join(", ")}`
                    : "";
                return {
                    content: [
                        {
                            type: "text",
                            text: `## Columns\n\n${lines.join("\n")}${hint}`,
                        },
                    ],
                };
            }
            case "tasks_list": {
                const parsed = ListTasksSchema.parse(args);
                const scope = parsed.scope ?? "taskboard";
                const pageFromCursor = parsed.cursor
                    ? decodePageCursor(parsed.cursor).page
                    : null;
                const page = pageFromCursor ?? parsed.page ?? 1;
                const result = scope === "archived"
                    ? await listArchivedTasks(env.projectId, page)
                    : scope === "taskboard"
                        ? await listTaskboardTasks(env.projectId, page)
                        : scope === "feedback"
                            ? await listFeedbackTasks(env.projectId, page)
                            : await listTasks(env.projectId, {
                                page,
                                status: parsed.status,
                                priority: parsed.priority,
                                tag: parsed.tag,
                            });
                let tasks = result.tasks;
                const { idToName, nameToId } = await getColumnMappings(env.projectId);
                if (parsed.status) {
                    const targetId = nameToId.get(parsed.status.toLowerCase());
                    if (typeof targetId === "number") {
                        tasks = tasks.filter((t) => t.status_id === targetId);
                    }
                    else {
                        tasks = tasks.filter((t) => typeof t.status === "string" &&
                            t.status.toLowerCase() === parsed.status.toLowerCase());
                    }
                }
                if (parsed.priority) {
                    tasks = tasks.filter((t) => {
                        const p = typeof t.priority === "string"
                            ? t.priority
                            : getPriorityName(t.priority_id);
                        return p === parsed.priority;
                    });
                }
                if (parsed.tag) {
                    const target = parsed.tag.toLowerCase();
                    tasks = tasks.filter((t) => (t.tag_names ?? []).some((tag) => tag.toLowerCase() === target));
                }
                if (env.activeColumnIds && (scope === "taskboard" || scope === "all")) {
                    const allowed = new Set(env.activeColumnIds);
                    tasks = tasks.filter((t) => typeof t.status_id === "number" ? allowed.has(t.status_id) : true);
                }
                tasks = sortTasks(tasks, parsed.sort);
                const limited = tasks.slice(0, env.pageSize);
                const items = limited.map((t) => {
                    const statusName = typeof t.status === "string"
                        ? t.status
                        : typeof t.status_id === "number"
                            ? idToName.get(t.status_id) ?? "unknown"
                            : "feedback";
                    const prioName = typeof t.priority === "string"
                        ? t.priority
                        : getPriorityName(t.priority_id);
                    const desc = truncate(t.description, 140).text;
                    return `- #${t.local_task_id}: ${desc}\n  status: ${statusName} | priority: ${prioName} | updated: ${t.updated_at}`;
                });
                const meta = result.meta;
                const total = meta?.count ?? tasks.length;
                const currentPage = meta?.current_page ?? page;
                const totalPages = meta?.total_pages ?? null;
                const cursor = encodePageCursor({ page: currentPage });
                const nextPage = totalPages && currentPage < totalPages ? currentPage + 1 : null;
                const prevPage = currentPage > 1 ? currentPage - 1 : null;
                const nextCursor = nextPage ? encodePageCursor({ page: nextPage }) : null;
                const prevCursor = prevPage ? encodePageCursor({ page: prevPage }) : null;
                const headerParts = [
                    `scope: ${scope}`,
                    `sort: ${parsed.sort}`,
                    `page: ${currentPage}`,
                ];
                if (totalPages)
                    headerParts.push(`total_pages: ${totalPages}`);
                return {
                    content: [
                        {
                            type: "text",
                            text: `## Tasks (${limited.length}/${total})\n` +
                                `${headerParts.join(" | ")}\n` +
                                `page_size: ${env.pageSize}\n` +
                                `cursor: ${cursor}\n` +
                                (nextPage ? `next_page: ${nextPage}\n` : "") +
                                (prevPage ? `prev_page: ${prevPage}\n` : "") +
                                (nextCursor ? `next_cursor: ${nextCursor}\n` : "") +
                                (prevCursor ? `prev_cursor: ${prevCursor}\n` : "") +
                                `\n${items.join("\n")}`, 
                        },
                    ],
                };
            }
            case "task_get": {
                const parsed = LocalTaskSchema.parse(args);
                const result = await getTaskByLocalId(env.projectId, parsed.local_task_id);
                const task = result.task;
                const { idToName } = await getColumnMappings(env.projectId);
                const statusName = typeof task.status === "string"
                    ? task.status
                    : typeof task.status_id === "number"
                        ? idToName.get(task.status_id) ?? "unknown"
                        : "feedback";
                const priorityName = typeof task.priority === "string"
                    ? task.priority
                    : getPriorityName(task.priority_id);
                const siteUrl = typeof task.site === "string" ? task.site : task.site?.url;
                const pageUrl = task.selector_info?.url ||
                    (siteUrl && task.url
                        ? (() => {
                            try {
                                return new URL(task.url, siteUrl).toString();
                            }
                            catch {
                                return task.url;
                            }
                        })()
                        : siteUrl || task.url || "Not available");
                const selector = task.selector_info?.path ||
                    task.selector_info?.selector ||
                    "Not available";
                const screenshot = task.screenshot_url ?? task.screenshot ?? "No screenshot";
                const clientInfo = task.client_info || {};
                const os = task.requester_os ||
                    clientInfo.operating_system ||
                    task.os ||
                    "Not available";
                const browser = task.requester_browser ||
                    clientInfo.browser ||
                    task.browser ||
                    "Not available";
                const resolution = task.requester_resolution ||
                    clientInfo.resolution ||
                    task.resolution ||
                    "Not available";
                const windowSize = task.requester_browser_size ||
                    clientInfo.browser_window_size ||
                    task.window_size ||
                    "Not available";
                const colorDepth = clientInfo.color_depth ||
                    (task.color_depth ? `${task.color_depth}` : "Not available");
                const link = task.admin_link ||
                    (task.project_id && task.local_task_id
                        ? `https://www.bugherd.com/projects/${task.project_id}/tasks/${task.local_task_id}`
                        : null);
                const previewMaxChars = Math.min(env.descriptionMaxChars, 600);
                const { chunk: descChunk, nextOffset: descNextOffset, nextCursor: descNextCursor } = textChunk(task.description, 0, previewMaxChars);
                const descHint = descNextCursor
                    ? `\n\ndescription_next_offset: ${descNextOffset}\ndescription_next_cursor: ${descNextCursor}\nUse task_description_more with cursor (or offset) to read more.`
                    : "";
                const techLines = [
                    `page_url: ${pageUrl}`,
                    `selector: ${selector}`,
                    `screenshot: ${screenshot}`,
                    `os: ${os}`,
                    `browser: ${browser}`,
                    `resolution: ${resolution}`,
                    `window_size: ${windowSize}`,
                    `color_depth: ${colorDepth}`,
                ];
                if (task.fullstory_session_url)
                    techLines.push(`fullstory: ${task.fullstory_session_url}`);
                if (task.logrocket_session_url)
                    techLines.push(`logrocket: ${task.logrocket_session_url}`);
                return {
                    content: [
                        {
                            type: "text",
                            text: `## Task #${task.local_task_id}\n\n` +
                                `id: ${task.id}\n` +
                                `status: ${statusName}\n` +
                                `priority: ${priorityName}\n` +
                                `created: ${task.created_at}\n` +
                                `updated: ${task.updated_at}\n` +
                                (link ? `link: ${link}\n` : "") +
                                `\n### Technical\n${techLines.join("\n")}\n` +
                                `\n### Description\n${descChunk}${descHint}`,
                        },
                    ],
                };
            }
            case "task_description_more": {
                const parsed = TaskDescriptionMoreSchema.parse(args);
                const result = await getTaskByLocalId(env.projectId, parsed.local_task_id);
                const task = result.task;
                const offset = parsed.cursor ? decodeTextCursor(parsed.cursor).offset : 0;
                const { chunk, nextOffset, nextCursor } = textChunk(task.description, offset, env.descriptionMaxChars);
                return {
                    content: [
                        {
                            type: "text",
                            text: `## Task #${task.local_task_id} Description (chunk)\n` +
                                `offset: ${offset}\n` +
                                (nextOffset !== null ? `next_offset: ${nextOffset}\n` : "") +
                                (nextCursor ? `next_cursor: ${nextCursor}\n` : "") +
                                `\n${chunk}`,
                        },
                    ],
                };
            }
            case "task_move_status": {
                const parsed = MoveTaskSchema.parse(args);
                const result = await getTaskByLocalId(env.projectId, parsed.local_task_id);
                const task = result.task;
                const { idToName } = await getColumnMappings(env.projectId);
                const toName = idToName.get(parsed.to_column_id);
                if (!toName) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Error: Unknown column id ${parsed.to_column_id}. Use columns_list to see valid ids.`,
                            },
                        ],
                        isError: true,
                    };
                }
                const fromName = typeof task.status === "string"
                    ? task.status
                    : typeof task.status_id === "number"
                        ? idToName.get(task.status_id) ?? "unknown"
                        : "feedback";
                await updateTask(env.projectId, task.id, { status: toName });
                return {
                    content: [
                        {
                            type: "text",
                            text: `✅ Task #${task.local_task_id} moved\n\nfrom: ${fromName}\nto: ${toName}`,
                        },
                    ],
                };
            }
            case "comments_list": {
                const parsed = ListCommentsSchema.parse(args);
                const pageFromCursor = parsed.cursor
                    ? decodePageCursor(parsed.cursor).page
                    : null;
                const page = pageFromCursor ?? parsed.page ?? 1;
                const taskResult = await getTaskByLocalId(env.projectId, parsed.local_task_id);
                const task = taskResult.task;
                const result = await listComments(env.projectId, task.id);
                const comments = result.comments;
                const total = result.meta?.count ?? comments.length;
                const pageSize = env.pageSize;
                const start = (page - 1) * pageSize;
                const end = start + pageSize;
                const slice = comments.slice(start, end);
                const items = slice.map((c) => {
                    const author = c.user?.display_name ?? `user:${c.user_id}`;
                    const text = truncate(c.text, Math.min(env.commentMaxChars, 300)).text;
                    return `- id:${c.id} | ${author} | ${c.created_at}\n  ${text}`;
                });
                const cursor = encodePageCursor({ page });
                const nextPage = end < comments.length ? page + 1 : null;
                const prevPage = page > 1 ? page - 1 : null;
                const nextCursor = nextPage ? encodePageCursor({ page: nextPage }) : null;
                const prevCursor = prevPage ? encodePageCursor({ page: prevPage }) : null;
                return {
                    content: [
                        {
                            type: "text",
                            text: `## Comments on Task #${task.local_task_id} (${slice.length}/${total})\n` +
                                `page: ${page}\n` +
                                `page_size: ${pageSize}\n` +
                                `cursor: ${cursor}\n` +
                                (nextPage ? `next_page: ${nextPage}\n` : "") +
                                (prevPage ? `prev_page: ${prevPage}\n` : "") +
                                (nextCursor ? `next_cursor: ${nextCursor}\n` : "") +
                                (prevCursor ? `prev_cursor: ${prevCursor}\n` : "") +
                                `\n${items.join("\n")}`, 
                        },
                    ],
                };
            }
            case "comment_text_more": {
                const parsed = CommentTextMoreSchema.parse(args);
                const taskResult = await getTaskByLocalId(env.projectId, parsed.local_task_id);
                const task = taskResult.task;
                const result = await listComments(env.projectId, task.id);
                const comment = result.comments.find((c) => c.id === parsed.comment_id);
                if (!comment) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Error: Comment ${parsed.comment_id} not found on task #${task.local_task_id}.`,
                            },
                        ],
                        isError: true,
                    };
                }
                const author = comment.user?.display_name ?? `user:${comment.user_id}`;
                const offset = parsed.cursor ? decodeTextCursor(parsed.cursor).offset : 0;
                const { chunk, nextOffset, nextCursor } = textChunk(comment.text, offset, env.commentMaxChars);
                return {
                    content: [
                        {
                            type: "text",
                            text: `## Comment ${comment.id} on Task #${task.local_task_id} (chunk)\n\n` +
                                `author: ${author}\n` +
                                `created: ${comment.created_at}\n` +
                                `offset: ${offset}\n` +
                                (nextOffset !== null ? `next_offset: ${nextOffset}\n` : "") +
                                (nextCursor ? `next_cursor: ${nextCursor}\n` : "") +
                                `\n${chunk}`,
                        },
                    ],
                };
            }
            case "comment_add": {
                const parsed = AddCommentSchema.parse(args);
                const taskResult = await getTaskByLocalId(env.projectId, parsed.local_task_id);
                const task = taskResult.task;
                const created = await createComment(env.projectId, task.id, {
                    text: applyAgentSignature(parsed.text),
                    user_id: env.botUserId,
                });
                return {
                    content: [
                        {
                            type: "text",
                            text: `✅ Comment added to Task #${task.local_task_id}\n\nid: ${created.comment.id}`,
                        },
                    ],
                };
            }
            default:
                return {
                    content: [{ type: "text", text: `Unknown tool: ${name}` }],
                    isError: true,
                };
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return {
            content: [{ type: "text", text: `Error: ${message}` }],
            isError: true,
        };
    }
});
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : null;

if (PORT) {
    const sessions = new Map();
    function isAllowedOrigin(origin) {
        try {
            const parsed = new URL(origin);
            return ((parsed.protocol === "http:" || parsed.protocol === "https:") &&
                (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"));
        }
        catch {
            return false;
        }
    }
    const httpServer = createServer(async (req, res) => {
        const originHeader = req.headers.origin;
        if (originHeader) {
            const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
            if (!origin || !isAllowedOrigin(origin)) {
                res.writeHead(403, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Forbidden origin" }));
                return;
            }
            res.setHeader("Access-Control-Allow-Origin", origin);
            res.setHeader("Vary", "Origin");
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        }
        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }
        const url = new URL(req.url || "/", `http://localhost:${PORT}`);
        if (url.pathname === "/health") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "ok", sessions: sessions.size }));
            return;
        }
        if (url.pathname === "/sse") {
            const transport = new SSEServerTransport("/message", res);
            const sessionId = crypto.randomUUID();
            sessions.set(sessionId, transport);
            res.on("close", () => {
                sessions.delete(sessionId);
            });
            await server.connect(transport);
            return;
        }
        if (url.pathname === "/message" && req.method === "POST") {
            const sessionId = url.searchParams.get("sessionId");
            if (!sessionId) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Missing sessionId" }));
                return;
            }
            const transport = sessions.get(sessionId);
            if (!transport) {
                res.writeHead(404, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Session not found" }));
                return;
            }
            let body = "";
            req.on("data", (chunk) => (body += chunk));
            req.on("end", async () => {
                try {
                    await transport.handlePostMessage(req, res, body);
                }
                catch {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Internal server error" }));
                }
            });
            return;
        }
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
    });
    httpServer.listen(PORT, "127.0.0.1", () => {
        console.error(
            `BugHerd Project Worker MCP running on http://127.0.0.1:${PORT}`,
        );
        console.error(`  SSE endpoint: http://127.0.0.1:${PORT}/sse`);
    });
}
else {
    const transport = new StdioServerTransport();
    server
        .connect(transport)
        .then(() => {
        console.error("BugHerd Project Worker MCP running on stdio");
    })
        .catch((error) => {
        console.error("Fatal error:", error);
        process.exit(1);
    });
}