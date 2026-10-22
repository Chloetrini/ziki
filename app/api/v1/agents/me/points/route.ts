import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { agentIssueRequest } from "@/lib/agent-api/issues";
import { prisma } from "@/lib/prisma";
import { pointBalance } from "@/lib/points/balance";

const balanceQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((query) => !query.from || !query.to || query.from.getTime() <= query.to.getTime(), {
    message: "`from` must not be after `to`.",
  });

/**
 * GET /api/v1/agents/me/points?from=&to= — the balance of the person this key
 * works for (#618), summed from the append-only PointEntry ledger inside the
 * agent's tenant. The owner's, never a stranger's: the person comes from the
 * agent row, as on every other route here.
 *
 * `from`/`to` are optional inclusive ISO-8601 bounds on when the entry was
 * written; with neither, the period covers everything and matches `lifetime`.
 * The wallet address is deliberately not in this response: it is readable only
 * by the person and tenant admins, and an agent is neither.
 *
 * Rate: charged as a read. Audited as `points.balance`.
 */
export async function GET(request: NextRequest) {
  return agentIssueRequest(request, "points.balance", "observer", null, async (agent) => {
    const parsed = balanceQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "from and to must be ISO-8601 dates, and from must not be after to." },
        { status: 400 },
      );
    }

    const balance = await pointBalance(prisma, {
      tenantId: agent.tenantId,
      userId: agent.ownerId,
      from: parsed.data.from,
      to: parsed.data.to,
    });

    return NextResponse.json({
      user_id: agent.ownerId,
      tenant_id: agent.tenantId,
      lifetime: balance.lifetime,
      period: balance.period,
    });
  });
}

const apiMethodNotAllowed = createMethodNotAllowed(["GET", "HEAD", "OPTIONS"]);
const apiOptions = createOptions(["GET", "HEAD", "OPTIONS"]);
export const POST = apiMethodNotAllowed;
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
export const OPTIONS = apiOptions;
