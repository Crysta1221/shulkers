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
  // For objects, arrays, etc., return empty string to avoid [object Object]
  return "";
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
      let output = "";

      const usagePrefix = pc.yellow("Usage:");
      const anyCtx = ctx as Record<string, unknown>;
      let commandArgs = anyCtx.command
        ? (anyCtx.command as Record<string, unknown>).args
        : undefined;

      // Fallback: If args not found in context, look up in subCommands definition
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
        commandArgs = cmd.args;
      }

      if (ctx.callMode === "subCommand" && ctx.name) {
        const cmdDef = anyCtx.command as Record<string, unknown> | undefined;
        const hasSubCmds = cmdDef?.subCommands;

        // Build positional args string
        let positionalArgsStr = "";
        const argsForPositional = commandArgs as
          | Record<string, Record<string, unknown>>
          | undefined;
        if (argsForPositional && typeof argsForPositional === "object") {
          for (const [argName, schema] of Object.entries(argsForPositional)) {
            if (schema.type === "positional") {
              const isRequired = schema.required === true;
              positionalArgsStr += isRequired
                ? ` <${argName}>`
                : ` [${argName}]`;
            }
          }
        }

        // Check for non-positional options
        let hasOptions = false;
        if (argsForPositional && typeof argsForPositional === "object") {
          for (const [, schema] of Object.entries(argsForPositional)) {
            if (schema.type !== "positional") {
              hasOptions = true;
              break;
            }
          }
        }

        output += `${usagePrefix} ${ctx.env.name} ${
          ctx.name
        }${positionalArgsStr}${hasOptions ? " [options]" : ""}${
          hasSubCmds ? " <command>" : ""
        }\n\n`;
      } else {
        output += `${usagePrefix} ${ctx.env.name} <command> [options]\n\n`;
      }

      // ROBUST COMMAND LOOKUP for subcommands
      let targetSubCommands: unknown = null;

      if (
        ctx.callMode === "entry" ||
        (ctx.callMode as string) === "root" ||
        ctx.name === "shulkers"
      ) {
        targetSubCommands = ctx.env.subCommands;
      } else {
        // Look in context subCommands
        targetSubCommands = anyCtx.subCommands;
        // If not found, look in current command definition
        if (
          !targetSubCommands &&
          (anyCtx.command as Record<string, unknown> | undefined)?.subCommands
        ) {
          targetSubCommands = (anyCtx.command as Record<string, unknown>)
            .subCommands;
        }
        // If still not found, look in env by name
        if (!targetSubCommands && ctx.name && ctx.env.subCommands) {
          const esc = ctx.env.subCommands;
          const cmdDef =
            esc instanceof Map
              ? esc.get(ctx.name)
              : (esc as Record<string, unknown>)[ctx.name];
          if ((cmdDef as Record<string, unknown> | undefined)?.subCommands) {
            targetSubCommands = (cmdDef as Record<string, unknown>).subCommands;
          }
        }
      }

      if (targetSubCommands) {
        const commands =
          targetSubCommands instanceof Map
            ? Array.from(targetSubCommands.entries())
            : Object.entries(targetSubCommands as object);

        if (commands.length > 0) {
          let commandsOutput = "";
          let count = 0;
          for (const [name, command] of commands) {
            // Skip root command and hidden aliases
            if (name === "shulkers" || name === ctx.name || name === "i")
              continue;
            const desc = toSafeString(
              (command as Record<string, unknown>).description
            );
            commandsOutput += `  ${pc.green(
              name.padEnd(maxLabelLen)
            )} ${desc}\n`;
            count++;
          }

          if (count > 0) {
            output += `${pc.yellow("Commands:")}\n${commandsOutput}\n`;
          }
        }
      }

      // Render command-specific options from args
      const argsObj = commandArgs as
        | Record<string, Record<string, unknown>>
        | undefined;
      if (argsObj && typeof argsObj === "object") {
        let optionsOutput = "";
        for (const [name, schema] of Object.entries(argsObj)) {
          if (schema.type === "positional") continue;
          const short = schema.short
            ? `-${toSafeString(schema.short)}, `
            : "    ";
          const label = `${short}--${name}`.padEnd(maxLabelLen);
          const desc = (schema.description as string) || "";
          optionsOutput += `  ${pc.green(label)} ${desc}\n`;
        }

        if (optionsOutput) {
          output += `${pc.yellow("Options:")}\n${optionsOutput}`;
        } else {
          output += `${pc.yellow("Options:")}\n`;
        }
      } else {
        output += `${pc.yellow("Options:")}\n`;
      }

      output += `  ${pc.green(
        "-v, --version".padEnd(maxLabelLen)
      )} output the current version\n`;
      output += `  ${pc.green(
        "-h, --help".padEnd(maxLabelLen)
      )} display help for command\n`;

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
