#!/usr/bin/env bun
import { cli, define } from "gunshi";
import pc from "picocolors";
import { checkForUpdatesSync } from "./lib/version-checker";
import pkg from "../package.json";

/** Application version from package.json */
export const VERSION = pkg.version;

// Import commands explicitly (alphabetical order)
import { addCommand } from "./commands/add";
import { infoCommand } from "./commands/info";
import init from "./commands/init";
import { installCommand } from "./commands/install";
import { linkCommand } from "./commands/link";
import { listCommand } from "./commands/list";
import { outdatedCommand } from "./commands/outdated";
import { removeCommand } from "./commands/remove";
import repo from "./commands/repo";
import { scanCommand } from "./commands/scan";
import { searchCommand } from "./commands/search";
import { updateCommand } from "./commands/update";
import { upgradeCommand } from "./commands/upgrade";

/**
 * Safely convert unknown value to string.
 */
function toSafeString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

/** Type for command arguments schema */
type ArgsSchema = Record<string, Record<string, unknown>>;

/**
 * Build positional arguments string from args schema.
 * e.g., " <name>" or " [name]" depending on required flag
 */
function buildPositionalArgsString(args: ArgsSchema | undefined): string {
  if (!args || typeof args !== "object") return "";

  let result = "";
  for (const [argName, schema] of Object.entries(args)) {
    if (schema.type === "positional") {
      const isRequired = schema.required === true;
      result += isRequired ? ` <${argName}>` : ` [${argName}]`;
    }
  }
  return result;
}

/**
 * Check if args schema has non-positional options.
 */
function hasNonPositionalOptions(args: ArgsSchema | undefined): boolean {
  if (!args || typeof args !== "object") return false;

  for (const schema of Object.values(args)) {
    if (schema.type !== "positional") return true;
  }
  return false;
}

/**
 * Resolve target subcommands from context.
 */
function resolveSubCommands(
  ctx: Record<string, unknown>,
  envSubCommands: unknown
): unknown {
  const callMode = ctx.callMode as string;
  const name = ctx.name as string | undefined;

  // Root/entry mode: use env subcommands
  if (callMode === "entry" || callMode === "root" || name === "shulkers") {
    return envSubCommands;
  }

  // Try context subCommands first
  if (ctx.subCommands) return ctx.subCommands;

  // Try command definition
  const command = ctx.command as Record<string, unknown> | undefined;
  if (command?.subCommands) return command.subCommands;

  // Try looking up in env by name
  if (name && envSubCommands) {
    const cmdDef =
      envSubCommands instanceof Map
        ? envSubCommands.get(name)
        : (envSubCommands as Record<string, unknown>)[name];
    if ((cmdDef as Record<string, unknown> | undefined)?.subCommands) {
      return (cmdDef as Record<string, unknown>).subCommands;
    }
  }

  return null;
}

/**
 * Render subcommands section for help output.
 */
function renderSubCommandsSection(
  targetSubCommands: unknown,
  currentName: string | undefined,
  maxLabelLen: number
): string {
  if (!targetSubCommands) return "";

  const commands =
    targetSubCommands instanceof Map
      ? Array.from(targetSubCommands.entries())
      : Object.entries(targetSubCommands as object);

  if (commands.length === 0) return "";

  let output = "";
  let count = 0;

  for (const [name, command] of commands) {
    // Skip root command and hidden aliases
    if (name === "shulkers" || name === currentName || name === "i") continue;

    const desc = toSafeString((command as Record<string, unknown>).description);
    output += `  ${pc.green(name.padEnd(maxLabelLen))} ${desc}\n`;
    count++;
  }

  return count > 0 ? `${pc.yellow("Commands:")}\n${output}\n` : "";
}

/**
 * Render options section for help output.
 */
function renderOptionsSection(
  args: ArgsSchema | undefined,
  maxLabelLen: number
): string {
  let output = `${pc.yellow("Options:")}\n`;

  if (args && typeof args === "object") {
    for (const [name, schema] of Object.entries(args)) {
      if (schema.type === "positional") continue;

      const short = schema.short ? `-${toSafeString(schema.short)}, ` : "    ";
      const label = `${short}--${name}`.padEnd(maxLabelLen);
      const desc = (schema.description as string) || "";
      output += `  ${pc.green(label)} ${desc}\n`;
    }
  }

  // Standard options
  output += `  ${pc.green("-v, --version".padEnd(maxLabelLen))} output the current version\n`;
  output += `  ${pc.green("-h, --help".padEnd(maxLabelLen))} display help for command\n`;

  return output;
}

// Commands registered in alphabetical order
const subCommands = {
  add: addCommand,
  i: installCommand,
  info: infoCommand,
  init,
  install: installCommand,
  link: linkCommand,
  list: listCommand,
  outdated: outdatedCommand,
  remove: removeCommand,
  repo,
  scan: scanCommand,
  search: searchCommand,
  update: updateCommand,
  upgrade: upgradeCommand,
};

/**
 * Define the root command properties.
 */
const root = define({
  name: "shulkers",
  description: "Minecraft Server Manager CLI",
  version: VERSION,
  subCommands,
  run: async (ctx) => {
    // Show help when no subcommand is provided
    const globalExt = (ctx.extensions as Record<string, unknown>)[
      "g:global"
    ] as { showUsage?: () => Promise<void> } | undefined;
    if (globalExt?.showUsage) {
      await globalExt.showUsage();
    }
  },
});

try {
  await cli(process.argv.slice(2), root, {
    name: "shulkers|sks",
    version: VERSION,
    description: "Minecraft Server Manager CLI",
    subCommands,

    renderHeader: async (ctx) => {
      const commandName =
        ctx.callMode === "subCommand" && ctx.name ? ` ${ctx.name}` : "";

      const title =
        pc.green(pc.bold("📦 Shulkers")) +
        pc.reset(commandName) +
        pc.dim(` v${ctx.env.version}`);

      const isHelp = !!ctx.values.help;
      const description = isHelp
        ? ctx.callMode === "subCommand"
          ? ctx.description
          : ctx.env.description ?? ctx.description
        : "";

      // Check for updates (non-blocking, uses cache)
      let updateNotice = "";
      const updateInfo = checkForUpdatesSync();
      if (updateInfo?.hasUpdate) {
        updateNotice =
          "\n" +
          pc.cyan("ℹ️") +
          " " +
          pc.cyan(
            `A new version (v${updateInfo.latestVersion}) is available! Run 'sks upgrade' to update.`
          );
      }

      const header = description ? `${title}\n${description}` : title;
      return header + updateNotice;
    },

    renderValidationErrors: async (_ctx, error) => {
      // Format validation errors with proper Error: prefix
      const messages = error.errors.map((e: Error) => e.message).join("\n");
      return `${pc.red(pc.bold("Error:"))} ${pc.red(messages)}`;
    },

    renderUsage: async (ctx) => {
      const maxLabelLen = 22;
      const usagePrefix = pc.yellow("Usage:");
      const anyCtx = ctx as Record<string, unknown>;

      // Resolve command args from context or subCommands definition
      let commandArgs = (anyCtx.command as Record<string, unknown> | undefined)
        ?.args as ArgsSchema | undefined;

      if (
        !commandArgs &&
        ctx.callMode === "subCommand" &&
        ctx.name &&
        Object.prototype.hasOwnProperty.call(subCommands, ctx.name)
      ) {
        const cmd = subCommands[ctx.name as keyof typeof subCommands] as Record<
          string,
          unknown
        >;
        commandArgs = cmd.args as ArgsSchema | undefined;
      }

      // Build usage line
      let output = "";
      if (ctx.callMode === "subCommand" && ctx.name) {
        const cmdDef = anyCtx.command as Record<string, unknown> | undefined;
        const hasSubCmds = !!cmdDef?.subCommands;
        const positionalArgs = buildPositionalArgsString(commandArgs);
        const optionsSuffix = hasNonPositionalOptions(commandArgs)
          ? " [options]"
          : "";
        const subCmdSuffix = hasSubCmds ? " <command>" : "";

        output += `${usagePrefix} ${ctx.env.name} ${ctx.name}${positionalArgs}${optionsSuffix}${subCmdSuffix}\n\n`;
      } else {
        output += `${usagePrefix} ${ctx.env.name} <command> [options]\n\n`;
      }

      // Render subcommands section
      const targetSubCommands = resolveSubCommands(anyCtx, ctx.env.subCommands);
      output += renderSubCommandsSection(
        targetSubCommands,
        ctx.name,
        maxLabelLen
      );

      // Render options section
      output += renderOptionsSection(commandArgs, maxLabelLen);

      return output;
    },
  });
} catch (e: unknown) {
  if (e instanceof Error) {
    console.error(pc.red(pc.bold("Error:")) + " " + pc.red(e.message));
  } else {
    console.error(
      pc.red(pc.bold("Error:")) + " " + pc.red("An unexpected error occurred.")
    );
    console.error(e);
  }
  process.exit(1);
}
