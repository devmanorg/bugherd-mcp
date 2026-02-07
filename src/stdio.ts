#!/usr/bin/env node
/**
 * BugHerd MCP Server - stdio mode entrypoint
 *
 * This file provides backwards compatibility for stdio mode.
 * Use this if you need to run BugHerd as a separate process per Claude session.
 *
 * Usage:
 *   node dist/stdio.js
 *
 * The admin server supports both modes:
 *   - stdio mode (default): node dist/bugherd-admin-mcp.js
 *   - HTTP mode: PORT=3003 node dist/bugherd-admin-mcp.js
 */

// Re-export the admin MCP server entrypoint
import "./bugherd-admin-mcp.js";
