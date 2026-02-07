/**
 * BugHerd API v2 TypeScript Types
 * @see https://www.bugherd.com/api_v2
 */

export interface BugherdMeta {
  count: number;
  total_pages?: number;
  current_page?: number;
}

// ============================================================================
// Organization Types
// ============================================================================

export interface BugherdOrganization {
  id: number;
  name: string;
  timezone?: string;
}

export interface BugherdOrganizationResponse {
  organization: BugherdOrganization;
}

// ============================================================================
// User Types
// ============================================================================

export interface BugherdUser {
  id: number;
  email: string;
  display_name: string;
  avatar_url: string | null;
}

export interface BugherdMember extends BugherdUser {
  role?: string;
  projects?: number[];
}

export interface BugherdGuest extends BugherdUser {
  projects?: number[];
}

export interface BugherdUsersResponse {
  users: BugherdUser[];
  meta?: BugherdMeta;
}

// BugHerd API returns `users` for members/guests endpoints too
export interface BugherdMembersResponse {
  users: BugherdMember[];
  meta?: BugherdMeta;
}

export interface BugherdGuestsResponse {
  users: BugherdGuest[];
  meta?: BugherdMeta;
}

// ============================================================================
// Project Types
// ============================================================================

export interface BugherdProject {
  id: number;
  name: string;

  // Common project fields (vary by endpoint)
  created_at?: string;
  updated_at?: string;
  owner_name?: string;
  devurl?: string;
  sites?: string[];

  // Settings (often only on show project)
  api_key?: string;
  is_active?: boolean;
  is_public?: boolean | null;
  guests_see_guests?: boolean;
  allow_guests_change_task_status?: boolean;
  assign_guests?: boolean;
  allow_project_summary_email?: boolean;
  allow_task_done_email?: boolean;
  allow_project_owner_notifications?: boolean;
  change_guest_default_column?: boolean;

  members?: BugherdUser[];
  guests?: BugherdUser[];
  columns?: BugherdColumn[];
}

export interface BugherdProjectsResponse {
  projects: BugherdProject[];
  meta?: BugherdMeta;
}

export interface BugherdProjectResponse {
  project: BugherdProject;
}

// ============================================================================
// Task Types
// ============================================================================

export type BugherdTaskStatus =
  | "backlog"
  | "todo"
  | "doing"
  | "done"
  | "closed";

export type BugherdTaskPriority =
  | "not set"
  | "critical"
  | "important"
  | "normal"
  | "minor";

export interface BugherdTask {
  id: number;
  project_id?: number;
  project_name?: string;

  local_task_id: number;
  priority_id: number | null;
  status_id: number | null;

  title?: string | null;
  description: string;

  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  deleted_at?: string | null;
  due_at?: string | null;

  external_id: string | null;

  requester_id?: number;
  requester_email: string;

  // Different endpoints / versions expose assignment differently
  assigned_to_id?: number | null;
  assigned_to?: BugherdUser | null;
  assignee_ids?: number[];
  assignees?: BugherdUser[];

  tag_names: string[];

  // On list endpoints this may be absent
  secret_link?: string;
  admin_link?: string;

  attachments?: unknown[];
  column_id?: number;

  // Per API docs this field is called screenshot_url
  screenshot_url?: string | null;
  // Backwards/undocumented alias (kept for compatibility)
  screenshot?: string | null;

  // BugHerd task environment metadata (real-world API responses)
  requester_os?: string | null;
  requester_browser?: string | null;
  requester_browser_size?: string | null;
  requester_resolution?: string | null;

  // Selector info varies between API versions
  selector_info?: {
    // Common in newer payloads
    path?: string;
    html?: string;
    version?: number;
    data?: {
      bugOffsetX?: number;
      bugOffsetY?: number;
    };

    // Older/alternative fields (kept for compatibility)
    selector?: string;
    url?: string;
  } | null;

  // The API docs mention `site` and `url`, but in practice `site` may be a string
  site?: string | { url?: string } | null;
  url?: string | null;

  // Legacy/alternative environment structure seen in some payloads
  client_info?: {
    operating_system?: string;
    browser?: string;
    resolution?: string;
    browser_window_size?: string;
    color_depth?: string;
  } | null;

  // Sometimes present as a generic object
  metadata?: Record<string, unknown>;

  screenshot_data?: {
    screenshot_width?: number;
    screenshot_height?: number;
    screenshot_pin_x?: number;
    screenshot_pin_y?: number;
  };

  fullstory_session_url?: string | null;
  logrocket_session_url?: string | null;

  logs?: unknown;
  updater?: BugherdUser | null;
  requester?: BugherdUser | null;

  // Alternative field names (non-standard, kept for compatibility)
  os?: string;
  browser?: string;
  resolution?: string;
  window_size?: string;
  color_depth?: number | string;

  // Computed fields
  status?: BugherdTaskStatus | string;
  priority?: BugherdTaskPriority | string;
}

export interface BugherdTasksResponse {
  tasks: BugherdTask[];
  meta?: BugherdMeta;
}

export interface BugherdTaskResponse {
  task: BugherdTask;
}

// ============================================================================
// User Tasks (grouped by project)
// ============================================================================

export interface BugherdUserTask {
  id: number;
  project_id: number;
  local_task_id: number;

  actor_id: number | null;
  priority_id: number | null;
  status_id: number | null;
  assigned_by_id: number | null;
  assigned_to_id: number | null;

  // These arrive as JSON-encoded strings in the API
  selector_info?: string | null;
  browser_info?: string | null;
  data?: string | null;

  site?: string | null;
  url?: string | null;

  description: string;
  comment: string | null;

  closed_at: string | null;
  created_at: string;
  updated_at: string;

  updated_by_integration_id: number | null;
  updated_by_user_id: number | null;

  requester_email: string;
  requester_id: number | null;

  test_session_id: string | null;
  window_screenshot: string | null;
  target_screenshot: string | null;
}

export interface BugherdUserTasksProjectGroup {
  name: string;
  id: number;
  user_tasks: BugherdUserTask[];
}

export type BugherdUserTasksResponse = BugherdUserTasksProjectGroup[];

// ============================================================================
// Comment Types
// ============================================================================

export interface BugherdComment {
  id: number;
  user_id: number;
  text: string;
  created_at: string;

  deleted_at?: string | null;
  updated_at?: string;

  // Not always included in list responses
  user?: BugherdUser;
  task?: BugherdTask;
}

export interface BugherdCommentsResponse {
  comments: BugherdComment[];
  meta?: BugherdMeta;
}

// ============================================================================
// API Error
// ============================================================================

export interface BugherdApiError {
  error: string;
  message?: string;
}

// ============================================================================
// Status and Priority Mappings
// ============================================================================

export const STATUS_MAP: Record<number, BugherdTaskStatus> = {
  0: "backlog",
  1: "todo",
  2: "doing",
  3: "done",
  4: "closed",
};

export const PRIORITY_MAP: Record<number, BugherdTaskPriority> = {
  0: "not set",
  1: "critical",
  2: "important",
  3: "normal",
  4: "minor",
};

export function getStatusName(statusId: number): BugherdTaskStatus {
  return STATUS_MAP[statusId] ?? "backlog";
}

export function getPriorityName(
  priorityId: number | null,
): BugherdTaskPriority {
  if (priorityId === null) return "not set";
  return PRIORITY_MAP[priorityId] ?? "not set";
}

// ============================================================================
// Attachment Types
// ============================================================================

export interface BugherdAttachment {
  id: number;
  file_name?: string | null;
  url: string;
  created_at: string;

  task_id?: number;
  user_id?: number | null;
  file_size?: number;
}

export interface BugherdAttachmentsResponse {
  attachments: BugherdAttachment[];
  meta?: BugherdMeta;
}

export interface BugherdAttachmentResponse {
  attachment: BugherdAttachment;
}

// ============================================================================
// Webhook Types
// ============================================================================

export type BugherdWebhookEvent =
  | "project_create"
  | "task_create"
  | "task_update"
  | "comment"
  | "task_destroy";

export interface BugherdWebhook {
  id: number;
  event: BugherdWebhookEvent;
  target_url: string;
  project_id: number | null;
}

export interface BugherdWebhooksResponse {
  webhooks: BugherdWebhook[];
}

export interface BugherdWebhookResponse {
  webhook: BugherdWebhook;
}

// ============================================================================
// Column Types (extended)
// ============================================================================

export interface BugherdColumn {
  id: number;
  name: string;

  project_id?: number;
  position?: number;
  tasks_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface BugherdColumnsResponse {
  columns: BugherdColumn[];
}

export interface BugherdColumnResponse {
  column: BugherdColumn;
}
