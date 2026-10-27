/**
 * Sweep and auto-assign pending bids via fair comment handshake.
 *
 *   pnpm tsx scripts/sweep-bids.ts
 *
 * Operator-run or cron-run against the database in DATABASE_URL.
 */
import { sweepPendingBids } from "../lib/cron/bids";

async function main() {
  const result = await sweepPendingBids();
  console.log(
    `Swept bids: invited=${result.invited}, assigned=${result.assigned}, lapsed=${result.lapsed}, errors=${result.errors.length}`,
  );
  if (result.errors.length > 0) {
    console.error("Errors:", result.errors);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
