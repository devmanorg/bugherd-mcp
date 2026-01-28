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
 * The main index.ts now supports both modes:
 *   - stdio mode (default): node dist/index.js
 *   - HTTP mode: PORT=3003 node dist/index.js
 */

// Re-export the main module which defaults to stdio when PORT is not set
import "./index.js";
