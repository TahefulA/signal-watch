/** Creates the Tiger Data schema. Run once: npx tsx scripts/migrate.ts */
import { migrate } from "@/lib/tiger";

migrate()
  .then(() => {
    console.log("Schema ready.");
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
