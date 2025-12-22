import { cli, define } from "gunshi";
import pc from "picocolors";
import add from "./repo/add";
import remove from "./repo/remove";
import list from "./repo/list";

const subCommands = {
  add,
  remove,
  list,
};

/**
 * Safely convert unknown value to string.
 */
function toSafeString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  // For objects, arrays, etc., return empty string to avoid [object Object]
  return "";
}

/**
 * Get subcommand name from positional arguments.
 */
function getSubCommandName(positionals: string[]): string | undefined {
  let positionalIndex = 0;
  if (positionals[0] === "repo") {
    positionalIndex = 1;
  }
  return positionals[positionalIndex];
}

/**
 * Render help for a specific subcommand.
 */
function renderSubCommandHelp(
  subCommandName: string,
  subCommand: Record<string, unknown>
): string {
  const maxLabelLen = 22;
  let output = "";

  // Header
  output += `${pc.green(pc.bold("📦 Shulkers"))} repo ${subCommandName}${pc.dim(
    " v0.1.0"
  )}\n`;
  output += `${toSafeString(subCommand.description)}\n\n`;

  output += `${pc.yellow("Usage:")} sks repo ${subCommandName}`;

  // Get args from subcommand
  const cmdArgs = subCommand.args as
    | Record<string, Record<string, unknown>>
    | undefined;

  if (cmdArgs && typeof cmdArgs === "object") {
    // Check for positional args
    const positionalArgs = Object.entries(cmdArgs).filter(
      ([, schema]) => schema.type === "positional"
    );
    if (positionalArgs.length > 0) {
      for (const [name, schema] of positionalArgs) {
        const required = schema.required ? "" : "?";
        output += ` <${name}${required}>`;
      }
    }

    // Check for option args
    const optionArgs = Object.entries(cmdArgs).filter(
      ([, schema]) => schema.type !== "positional"
    );
    if (optionArgs.length > 0) {
      output += " [options]";
    }
  }

  output += "\n\n";

  if (cmdArgs && typeof cmdArgs === "object") {
    // Show positional arguments
    const positionalArgs = Object.entries(cmdArgs).filter(
      ([, schema]) => schema.type === "positional"
    );
    if (positionalArgs.length > 0) {
      output += `${pc.yellow("Arguments:")}\n`;
      for (const [name, schema] of positionalArgs) {
        const desc = toSafeString(schema.description);
        const required = schema.required ? pc.dim(" (required)") : "";
        output += `  ${pc.green(
          `<${name}>`.padEnd(maxLabelLen)
        )} ${desc}${required}\n`;
      }
      output += "\n";
    }

    // Show options
    const optionArgs = Object.entries(cmdArgs).filter(
      ([, schema]) => schema.type !== "positional"
    );
    if (optionArgs.length > 0) {
      output += `${pc.yellow("Options:")}\n`;
      for (const [name, schema] of optionArgs) {
        const short = schema.short
          ? `-${toSafeString(schema.short)}, `
          : "    ";
        const label = `${short}--${name}`.padEnd(maxLabelLen);
        const desc = toSafeString(schema.description);
        output += `  ${pc.green(label)} ${desc}\n`;
      }
    } else {
      output += `${pc.yellow("Options:")}\n`;
    }
  } else {
    output += `${pc.yellow("Options:")}\n`;
  }

  output += `  ${pc.green(
    "-h, --help".padEnd(maxLabelLen)
  )} display help for command\n`;

  return output;
}

/**
 * Repository parent command definition.
 * Manually dispatches to nested subcommands since gunshi does not auto-dispatch.
 */
export default define({
  name: "repo",
  description: "Manage plugin/mod repositories",
  subCommands,
  rendering: {
    // Custom header for when help is requested
    header: async (ctx) => {
      const subCommandName = getSubCommandName(ctx.positionals);

      // If subcommand is provided and help is requested, show subcommand help
      if (subCommandName && ctx.values.help) {
        const subCommand = subCommands[
          subCommandName as keyof typeof subCommands
        ] as Record<string, unknown> | undefined;
        if (subCommand) {
          // Output subcommand help and return null to prevent usage rendering
          ctx.log(renderSubCommandHelp(subCommandName, subCommand));
          return "";
        }
      }

      // Default header for repo command
      const title =
        pc.green(pc.bold("📦 Shulkers")) +
        pc.reset(" repo") +
        pc.dim(` v${ctx.env.version}`);

      return ctx.values.help ? `${title}\n${ctx.description}` : title;
    },
    // Custom usage for when help is requested
    usage: async (ctx) => {
      const subCommandName = getSubCommandName(ctx.positionals);

      // If subcommand help was already rendered, return empty
      if (subCommandName && ctx.values.help) {
        const subCommand =
          subCommands[subCommandName as keyof typeof subCommands];
        if (subCommand) {
          return "";
        }
      }

      // Default usage rendering for repo command
      const maxLabelLen = 22;
      let output = "";

      output += `${pc.yellow("Usage:")} sks repo <command>\n\n`;

      output += `${pc.yellow("Commands:")}\n`;
      for (const [name, cmd] of Object.entries(subCommands)) {
        const desc = toSafeString((cmd as Record<string, unknown>).description);
        output += `  ${pc.green(name.padEnd(maxLabelLen))} ${desc}\n`;
      }
      output += "\n";

      output += `${pc.yellow("Options:")}\n`;
      output += `  ${pc.green(
        "-h, --help".padEnd(maxLabelLen)
      )} display help for command\n`;

      return output;
    },
  },
  run: async (ctx) => {
    // Positionals may include the parent command name, so we need to find the actual subcommand
    let positionalIndex = 0;
    if (ctx.positionals[0] === "repo") {
      positionalIndex = 1;
    }

    const subCommandName = ctx.positionals[positionalIndex];

    // If no subcommand provided, show help
    if (!subCommandName) {
      const globalExt = (ctx.extensions as Record<string, unknown>)[
        "g:global"
      ] as { showUsage?: () => Promise<void> } | undefined;
      if (globalExt?.showUsage) {
        await globalExt.showUsage();
      }
      return;
    }

    // Get the subcommand
    const subCommand = subCommands[subCommandName as keyof typeof subCommands];
    if (!subCommand) {
      throw new Error(`Unknown subcommand: ${subCommandName}`);
    }

    // Build args for subcommand from original argv
    const subCommandArgs: string[] = [];
    let foundSubCommand = false;
    for (const arg of ctx._) {
      if (foundSubCommand) {
        subCommandArgs.push(arg);
      } else if (arg === subCommandName) {
        foundSubCommand = true;
      }
    }

    // Execute subcommand with no extra header
    await cli(subCommandArgs, subCommand as Parameters<typeof cli>[1], {
      name: `repo ${subCommandName}`,
      renderHeader: null,
      renderValidationErrors: async (_subCtx, error) => {
        const messages = (error.errors as Error[])
          .map((e) => e.message)
          .join("\n");
        return `${pc.red(pc.bold("Error:"))} ${pc.red(messages)}`;
      },
    });
  },
});
