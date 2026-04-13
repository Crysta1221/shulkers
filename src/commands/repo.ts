import { define } from "gunshi";
import add from "./repo/add";
import remove from "./repo/remove";
import list from "./repo/list";

const subCommands = {
  add,
  remove,
  list,
};

/**
 * Repository parent command definition.
 */
export default define({
  name: "repo",
  description: "Manage plugin/mod repositories",
  subCommands,
  run: async () => {},
});
