import { afterEach, describe, expect, it, vi } from "vitest"
import { getProductionEventsForReport } from "./api"

const snapshot = {
  snapshotMaxIngestSeq: "42",
  snapshotIngestedBefore: "2026-07-17T18:00:00.000Z",
  snapshotSignature: "a".repeat(32),
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("getProductionEventsForReport", () => {
  it("recorre todas las páginas con el mismo snapshot y lo verifica", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          ...snapshot,
          items: [{ id: "event-2" }],
          hasMore: true,
          nextCursor: "cursor-2",
        }),
      )
      .mockResolvedValueOnce(
        json({
          ...snapshot,
          items: [{ id: "event-1" }],
          hasMore: false,
          nextCursor: null,
        }),
      )
      .mockResolvedValueOnce(
        json({
          stable: true,
          initialSignature: snapshot.snapshotSignature,
          currentSignature: snapshot.snapshotSignature,
          snapshotMaxIngestSeq: snapshot.snapshotMaxIngestSeq,
          snapshotIngestedBefore: snapshot.snapshotIngestedBefore,
        }),
      )
    vi.stubGlobal("fetch", fetchMock)

    const result = await getProductionEventsForReport("token", {
      from: "2026-07-01T06:00:00.000Z",
      to: "2026-08-01T05:59:59.999Z",
    })

    expect(result.events.map((event) => event.id)).toEqual(["event-2", "event-1"])
    const secondPageUrl = String(fetchMock.mock.calls[1][0])
    expect(secondPageUrl).toContain("cursor=cursor-2")
    expect(secondPageUrl).toContain("snapshotMaxIngestSeq=42")
    expect(secondPageUrl).toContain(`snapshotSignature=${snapshot.snapshotSignature}`)
    expect(String(fetchMock.mock.calls[2][0])).toContain("/production-event/reports/verify?")
  })
})
