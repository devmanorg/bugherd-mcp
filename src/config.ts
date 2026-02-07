import { z } from "zod/v4";

const EnvSchema = z.object({
  BUGHERD_API_KEY: z.string().min(1, "BUGHERD_API_KEY is required"),

  // Project worker server settings
  BUGHERD_PROJECT_ID: z.coerce
    .number()
    .int("BUGHERD_PROJECT_ID must be an integer")
    .positive("BUGHERD_PROJECT_ID must be > 0"),
  BUGHERD_BOT_USER_ID: z.coerce
    .number()
    .int("BUGHERD_BOT_USER_ID must be an integer")
    .positive("BUGHERD_BOT_USER_ID must be > 0"),

  // Pagination / output limits (local validation only)
  BUGHERD_PAGE_SIZE: z
    .coerce
    .number()
    .int("BUGHERD_PAGE_SIZE must be an integer")
    .positive("BUGHERD_PAGE_SIZE must be > 0")
    .optional(),

  BUGHERD_DESCRIPTION_MAX_CHARS: z
    .coerce
    .number()
    .int("BUGHERD_DESCRIPTION_MAX_CHARS must be an integer")
    .positive("BUGHERD_DESCRIPTION_MAX_CHARS must be > 0")
    .optional(),

  // Comment signature (optional)
  BUGHERD_AGENT_SIGNATURE: z.string().optional(),
  BUGHERD_AGENT_SIGNATURE_SEPARATOR: z.string().optional(),

  // Comma-separated column ids
  BUGHERD_ACTIVE_COLUMN_IDS: z.string().optional(),
});

function formatZodErrors(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `- ${path}: ${issue.message}`;
    })
    .join("\n");
}

export interface BugherdEnv {
  apiKey: string;
  projectId: number;
  botUserId: number;
  pageSize: number;
  descriptionMaxChars: number;
  agentSignature: string | null;
  agentSignatureSeparator: string;
  activeColumnIds: number[] | null;
}

export function loadEnvOrExit(): BugherdEnv {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration:");
    console.error(formatZodErrors(parsed.error));
    process.exit(1);
  }

  const pageSize = parsed.data.BUGHERD_PAGE_SIZE ?? 30;
  const descriptionMaxChars = parsed.data.BUGHERD_DESCRIPTION_MAX_CHARS ?? 4000;
  const agentSignature = parsed.data.BUGHERD_AGENT_SIGNATURE?.trim()
    ? parsed.data.BUGHERD_AGENT_SIGNATURE
    : null;
  const agentSignatureSeparator =
    parsed.data.BUGHERD_AGENT_SIGNATURE_SEPARATOR ?? "\n\n---\n";

  let activeColumnIds: number[] | null = null;
  if (parsed.data.BUGHERD_ACTIVE_COLUMN_IDS?.trim()) {
    const parts = parsed.data.BUGHERD_ACTIVE_COLUMN_IDS.split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const numbers: number[] = [];
    for (const part of parts) {
      const value = Number(part);
      if (!Number.isInteger(value) || value <= 0) {
        console.error(
          `Invalid BUGHERD_ACTIVE_COLUMN_IDS entry: '${part}'. Expected positive integer ids separated by commas.`,
        );
        process.exit(1);
      }
      numbers.push(value);
    }

    activeColumnIds = numbers.length > 0 ? numbers : null;
  }

  return {
    apiKey: parsed.data.BUGHERD_API_KEY,
    projectId: parsed.data.BUGHERD_PROJECT_ID,
    botUserId: parsed.data.BUGHERD_BOT_USER_ID,
    pageSize,
    descriptionMaxChars,
    agentSignature,
    agentSignatureSeparator,
    activeColumnIds,
  };
}

export function truncate(text: string, maxChars: number): {
  text: string;
  truncated: boolean;
} {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.substring(0, maxChars) + "…", truncated: true };
}
