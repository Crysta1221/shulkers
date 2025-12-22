import { define } from "gunshi";
import { installPlugin } from "./install";

/**
 * Add command - adds plugin(s) to project.yml.
 */
export const addCommand = define({
  name: "add",
  description: "Add plugin(s) to project.yml",
  args: {
    target: {
      type: "positional",
      description: "Plugin(s) to add (name or source:id[@version])",
      required: true,
    },
  },
  run: async (ctx) => {
    await installPlugin(ctx);
  },
});
