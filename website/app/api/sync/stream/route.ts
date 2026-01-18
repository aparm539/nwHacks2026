import { NextRequest } from "next/server";
import { db } from "@/db";
import { syncRuns } from "@/db/schema";
import { eq, or, desc } from "drizzle-orm";

// Server-Sent Events endpoint for real-time sync progress updates
export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: object) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      // Send initial state
      const [activeRun] = await db
        .select()
        .from(syncRuns)
        .where(or(eq(syncRuns.status, "running"), eq(syncRuns.status, "paused")))
        .orderBy(desc(syncRuns.startedAt))
        .limit(1);

      if (activeRun) {
        const progress =
          activeRun.totalItems > 0
            ? Math.round(
                ((activeRun.startMaxItem - activeRun.lastFetchedItem) /
                  activeRun.totalItems) *
                  100
              )
            : 0;

        sendEvent({
          type: "progress",
          syncRunId: activeRun.id,
          itemsFetched: activeRun.itemsFetched,
          totalItems: activeRun.totalItems,
          lastFetchedItem: activeRun.lastFetchedItem,
          targetEndItem: activeRun.targetEndItem,
          startMaxItem: activeRun.startMaxItem,
          progress,
          status: activeRun.status,
        });
      } else {
        sendEvent({ type: "idle" });
      }

      // Poll for updates every second
      const interval = setInterval(async () => {
        try {
          const [run] = await db
            .select()
            .from(syncRuns)
            .where(
              or(eq(syncRuns.status, "running"), eq(syncRuns.status, "paused"))
            )
            .orderBy(desc(syncRuns.startedAt))
            .limit(1);

          if (run) {
            const progress =
              run.totalItems > 0
                ? Math.round(
                    ((run.startMaxItem - run.lastFetchedItem) / run.totalItems) *
                      100
                  )
                : 0;

            sendEvent({
              type: "progress",
              syncRunId: run.id,
              itemsFetched: run.itemsFetched,
              totalItems: run.totalItems,
              lastFetchedItem: run.lastFetchedItem,
              targetEndItem: run.targetEndItem,
              startMaxItem: run.startMaxItem,
              progress,
              status: run.status,
            });
          } else {
            // Check if we just completed
            const [lastRun] = await db
              .select()
              .from(syncRuns)
              .orderBy(desc(syncRuns.completedAt))
              .limit(1);

            if (lastRun && lastRun.status === "completed") {
              sendEvent({
                type: "completed",
                syncRunId: lastRun.id,
                itemsFetched: lastRun.itemsFetched,
                totalItems: lastRun.totalItems,
              });
            } else {
              sendEvent({ type: "idle" });
            }
          }
        } catch (error) {
          sendEvent({ type: "error", message: String(error) });
        }
      }, 1000);

      // Clean up on close
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
