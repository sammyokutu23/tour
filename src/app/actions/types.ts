export type ActionState = {
  error?: string;
  ok?: boolean | string;
  fieldErrors?: Record<string, string[] | undefined>;
  data?: Record<string, unknown>;
} | null;
