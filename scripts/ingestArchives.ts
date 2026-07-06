import { runArchiveIngest } from "../server/archiveIngest.js";

runArchiveIngest().catch((err) => {
  console.error(err);
  process.exit(1);
});
