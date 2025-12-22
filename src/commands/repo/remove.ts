import { define } from "gunshi";
import pc from "picocolors";
import ora from "ora";
import { removeRepository } from "../../lib/config";
import { isProjectInitialized } from "../../lib/paths";

/**
 * Repository remove command definition.
 * Removes a custom repository by its ID.
 */
export default define({
  name: "remove",
  description: "Remove a custom repository by its ID",
  args: {
    global: {
      type: "boolean",
      short: "g",
      description: "Remove from global repositories (~/.shulkers/repository)",
    },
    id: {
      type: "positional",
      description: "Repository ID to remove",
      required: true,
    },
  },
  run: async (ctx) => {
    const target = ctx.positionals[0];
    const isGlobal = ctx.values.global ?? false;

    if (!target) {
      console.error(
        pc.red(pc.bold("Error:")) + " " + pc.red("Repository ID is required.")
      );
      console.log(pc.dim("Usage: sks repo remove <id> [--global]"));
      console.log(pc.dim("Run 'sks repo remove --help' for more information."));
      return;
    }

    // Check if project is initialized for local removal
    if (!isGlobal && !isProjectInitialized()) {
      console.error(
        pc.red(pc.bold("Error:")) +
          " " +
          pc.red("No shulkers project found in current directory.")
      );
      console.log(
        pc.dim(
          "Run 'sks init' first or use '--global' flag to remove from global."
        )
      );
      return;
    }

    const removed = removeRepository(target, isGlobal);

    if (removed) {
      const location = isGlobal ? "globally" : "locally";
      ora().succeed(`Repository '${target}' removed ${location}!`);
    } else {
      console.error(
        pc.red(pc.bold("Error:")) +
          " " +
          pc.red(
            `Repository '${target}' not found${
              isGlobal ? " in global repositories" : ""
            }.`
          )
      );
    }
  },
});
