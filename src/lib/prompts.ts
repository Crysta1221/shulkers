import pc from "picocolors";

/**
 * Error thrown when user cancels a prompt with SIGINT (Ctrl+C).
 */
export class OperationCanceledError extends Error {
  constructor() {
    super("Operation canceled");
    this.name = "OperationCanceledError";
  }
}

/**
 * Check if an error is a user force close (SIGINT).
 */
export function isUserCancelError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes("force closed") ||
      error.message.includes("ExitPromptError")
    );
  }
  return false;
}

/**
 * Handle operation canceled error by printing message and exiting.
 */
export function handleCancelError(error: unknown): never {
  if (isUserCancelError(error)) {
    console.log("");
    console.log(pc.red("❌ Operation canceled"));
    process.exit(0);
  }
  throw error;
}

/**
 * Wrap an async function to handle SIGINT gracefully.
 */
export async function withCancelHandler<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    handleCancelError(error);
  }
}
