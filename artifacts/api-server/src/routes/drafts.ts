import { Router, type IRouter } from "express";
import { eq, and, inArray, count, sql } from "drizzle-orm";
import { db, draftsTable, seatsTable, packsTable, picksTable, cardsTable } from "@workspace/db";
import {
  ListDraftsResponse,
  CreateDraftBody,
  GetDraftParams,
  GetDraftResponse,
  JoinDraftParams,
  JoinDraftBody,
  StartDraftParams,
  StartDraftResponse,
  GetSeatStateParams,
  GetSeatStateResponse,
  MakePickParams,
  MakePickBody,
  MakePickResponse,
  GetPoolParams,
  GetPoolResponse,
  GetDraftSummaryParams,
  GetDraftSummaryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// Helper to shuffle an array
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// List all drafts
router.get("/drafts", async (_req, res): Promise<void> => {
  const drafts = await db.select().from(draftsTable).orderBy(draftsTable.createdAt);
  res.json(ListDraftsResponse.parse(drafts));
});

// Create a draft
router.post("/drafts", async (req, res): Promise<void> => {
  const parsed = CreateDraftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [draft] = await db.insert(draftsTable).values({
    name: parsed.data.name,
    numPacks: parsed.data.numPacks,
    cardsPerPack: parsed.data.cardsPerPack,
    status: "waiting",
  }).returning();

  res.status(201).json(draft);
});

// Get draft details with seats
router.get("/drafts/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  const [draft] = await db.select().from(draftsTable).where(eq(draftsTable.id, id));
  if (!draft) {
    res.status(404).json({ error: "Draft not found" });
    return;
  }

  const seats = await db.select().from(seatsTable).where(eq(seatsTable.draftId, id)).orderBy(seatsTable.seatPosition);

  res.json(GetDraftResponse.parse({ ...draft, seats }));
});

// Delete a draft (and all associated data via cascade)
router.delete("/drafts/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  const [draft] = await db.select().from(draftsTable).where(eq(draftsTable.id, id));
  if (!draft) {
    res.status(404).json({ error: "Draft not found" });
    return;
  }

  await db.delete(draftsTable).where(eq(draftsTable.id, id));
  res.status(204).end();
});

// Join a draft
router.post("/drafts/:id/join", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  const [draft] = await db.select().from(draftsTable).where(eq(draftsTable.id, id));
  if (!draft) {
    res.status(404).json({ error: "Draft not found" });
    return;
  }

  if (draft.status !== "waiting") {
    res.status(400).json({ error: "Draft has already started" });
    return;
  }

  const parsed = JoinDraftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existingSeats = await db.select().from(seatsTable).where(eq(seatsTable.draftId, id));
  const seatPosition = existingSeats.length + 1;

  const [seat] = await db.insert(seatsTable).values({
    draftId: id,
    playerName: parsed.data.playerName,
    seatPosition,
  }).returning();

  res.status(201).json(seat);
});

// Start a draft
router.post("/drafts/:id/start", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  const [draft] = await db.select().from(draftsTable).where(eq(draftsTable.id, id));
  if (!draft) {
    res.status(404).json({ error: "Draft not found" });
    return;
  }

  if (draft.status !== "waiting") {
    res.status(400).json({ error: "Draft has already started" });
    return;
  }

  const seats = await db.select().from(seatsTable).where(eq(seatsTable.draftId, id)).orderBy(seatsTable.seatPosition);
  if (seats.length === 0) {
    res.status(400).json({ error: "No players have joined" });
    return;
  }

  const totalCardsNeeded = seats.length * draft.numPacks * draft.cardsPerPack;
  const allCards = await db.select().from(cardsTable);
  if (allCards.length < totalCardsNeeded) {
    res.status(400).json({ error: `Need at least ${totalCardsNeeded} cards in the library (currently ${allCards.length})` });
    return;
  }

  // Shuffle and distribute cards into packs
  const shuffled = shuffle(allCards.map(c => c.id));
  const packInserts: { draftId: number; currentSeatId: number; originalSeatId: number; packNumber: number; cardIds: string }[] = [];

  for (let packNum = 1; packNum <= draft.numPacks; packNum++) {
    for (let s = 0; s < seats.length; s++) {
      const seat = seats[s];
      const start = ((packNum - 1) * seats.length + s) * draft.cardsPerPack;
      const packCardIds = shuffled.slice(start, start + draft.cardsPerPack);
      packInserts.push({
        draftId: id,
        currentSeatId: seat.id,
        originalSeatId: seat.id,
        packNumber: packNum,
        cardIds: JSON.stringify(packCardIds),
      });
    }
  }

  await db.insert(packsTable).values(packInserts);

  const [updated] = await db.update(draftsTable)
    .set({ status: "active" })
    .where(eq(draftsTable.id, id))
    .returning();

  res.json(StartDraftResponse.parse({ ...updated, seats }));
});

// Get seat state (current pack)
router.get("/drafts/:id/seat/:seatId", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const rawSeatId = Array.isArray(req.params.seatId) ? req.params.seatId[0] : req.params.seatId;
  const draftId = parseInt(rawId, 10);
  const seatId = parseInt(rawSeatId, 10);

  const [draft] = await db.select().from(draftsTable).where(eq(draftsTable.id, draftId));
  if (!draft) {
    res.status(404).json({ error: "Draft not found" });
    return;
  }

  const [seat] = await db.select().from(seatsTable).where(eq(seatsTable.id, seatId));
  if (!seat) {
    res.status(404).json({ error: "Seat not found" });
    return;
  }

  const totalPicks = draft.numPacks * draft.cardsPerPack;

  // Count picks done by this seat
  const [pickCount] = await db
    .select({ count: count() })
    .from(picksTable)
    .where(and(eq(picksTable.draftId, draftId), eq(picksTable.seatId, seatId)));

  const picksDone = Number(pickCount?.count ?? 0);

  if (draft.status !== "active") {
    res.json(GetSeatStateResponse.parse({
      seat,
      currentPack: [],
      packNumber: 1,
      picksDone,
      totalPicks,
      draftStatus: draft.status,
      waitingForPack: false,
    }));
    return;
  }

  // Find the current pack for this seat (the pack currently assigned to this seat)
  const currentPackRow = await db
    .select()
    .from(packsTable)
    .where(and(eq(packsTable.draftId, draftId), eq(packsTable.currentSeatId, seatId)))
    .orderBy(packsTable.packNumber, packsTable.id)
    .limit(1);

  if (!currentPackRow.length) {
    // No pack assigned — either waiting or done
    const allPicks = await db.select({ count: count() }).from(picksTable).where(eq(picksTable.draftId, draftId));
    const totalSeats = (await db.select().from(seatsTable).where(eq(seatsTable.draftId, draftId))).length;
    const totalPicksNeeded = totalSeats * totalPicks;
    const allPicksMade = Number(allPicks[0]?.count ?? 0);

    if (allPicksMade >= totalPicksNeeded) {
      // Draft is done — update status
      await db.update(draftsTable).set({ status: "completed" }).where(eq(draftsTable.id, draftId));
      res.json(GetSeatStateResponse.parse({
        seat,
        currentPack: [],
        packNumber: draft.numPacks,
        picksDone,
        totalPicks,
        draftStatus: "completed",
        waitingForPack: false,
      }));
      return;
    }

    // Waiting for someone else to pass
    const currentPackNum = Math.floor(picksDone / draft.cardsPerPack) + 1;
    res.json(GetSeatStateResponse.parse({
      seat,
      currentPack: [],
      packNumber: Math.min(currentPackNum, draft.numPacks),
      picksDone,
      totalPicks,
      draftStatus: "active",
      waitingForPack: true,
    }));
    return;
  }

  const packRow = currentPackRow[0];

  // Determine if this seat is waiting for others (has more picks than the minimum across all seats)
  const allSeatsForDraft = await db.select().from(seatsTable).where(eq(seatsTable.draftId, draftId));
  const allPickCounts = await db
    .select({ seatId: picksTable.seatId, cnt: count() })
    .from(picksTable)
    .where(eq(picksTable.draftId, draftId))
    .groupBy(picksTable.seatId);
  const picksCountMap = new Map(allPickCounts.map(p => [p.seatId, Number(p.cnt)]));
  const minPicksDone = Math.min(...allSeatsForDraft.map(s => picksCountMap.get(s.id) ?? 0));
  const waitingForOthers = picksDone > minPicksDone;

  const cardIds: number[] = JSON.parse(packRow.cardIds);

  // Fetch actual card data (only expose the pack if not waiting for others)
  let currentPack: typeof cardsTable.$inferSelect[] = [];
  if (!waitingForOthers && cardIds.length > 0) {
    currentPack = await db.select().from(cardsTable).where(inArray(cardsTable.id, cardIds));
    // Preserve order from cardIds
    const cardMap = new Map(currentPack.map(c => [c.id, c]));
    currentPack = cardIds.map(id => cardMap.get(id)).filter(Boolean) as typeof cardsTable.$inferSelect[];
  }

  const currentPackNum = packRow.packNumber;

  res.json(GetSeatStateResponse.parse({
    seat,
    currentPack,
    currentPackId: waitingForOthers ? undefined : packRow.id,
    packNumber: currentPackNum,
    picksDone,
    totalPicks,
    draftStatus: "active",
    waitingForPack: false,
    waitingForOthers,
  }));
});

// Make a pick
router.post("/drafts/:id/pick", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const draftId = parseInt(rawId, 10);

  const [draft] = await db.select().from(draftsTable).where(eq(draftsTable.id, draftId));
  if (!draft) {
    res.status(404).json({ error: "Draft not found" });
    return;
  }

  if (draft.status !== "active") {
    res.status(400).json({ error: "Draft is not active" });
    return;
  }

  const parsed = MakePickBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { seatId, cardId, packId } = parsed.data;

  const [seat] = await db.select().from(seatsTable).where(eq(seatsTable.id, seatId));
  if (!seat) {
    res.status(404).json({ error: "Seat not found" });
    return;
  }

  const seats = await db.select().from(seatsTable).where(eq(seatsTable.draftId, draftId)).orderBy(seatsTable.seatPosition);
  const numSeats = seats.length;

  // Atomic: lock the exact pack the client saw, validate, pick, and pass — all in one transaction.
  // FOR UPDATE prevents a second concurrent request for the same seat from double-picking.
  type PickTxResult =
    | { ok: true }
    | { ok: false; code: number; error: string };
  let txResult: PickTxResult = { ok: false, code: 400, error: "Pick failed" };

  await db.transaction(async (tx) => {
    // Lock the specific pack row the client was looking at
    const [packRow] = await tx
      .select()
      .from(packsTable)
      .where(and(
        eq(packsTable.id, packId),
        eq(packsTable.draftId, draftId),
        eq(packsTable.currentSeatId, seatId),
      ))
      .for("update");

    if (!packRow) {
      txResult = { ok: false, code: 400, error: "Pack no longer available for this seat" };
      return;
    }

    const cardIds: number[] = JSON.parse(packRow.cardIds);
    if (!cardIds.includes(cardId)) {
      txResult = { ok: false, code: 400, error: "Card not in current pack" };
      return;
    }

    await tx.insert(picksTable).values({ draftId, seatId, cardId, packId });

    // Remove the picked card from the pack; keep the pack at this seat for now
    const remaining = cardIds.filter(id => id !== cardId);
    if (remaining.length === 0) {
      await tx.delete(packsTable).where(eq(packsTable.id, packId));
    } else {
      await tx.update(packsTable).set({
        cardIds: JSON.stringify(remaining),
      }).where(eq(packsTable.id, packId));
    }

    // Count picks per seat to decide whether to rotate all packs
    const pickCounts = await tx
      .select({ seatId: picksTable.seatId, cnt: count() })
      .from(picksTable)
      .where(eq(picksTable.draftId, draftId))
      .groupBy(picksTable.seatId);
    const picksMap = new Map(pickCounts.map(p => [p.seatId, Number(p.cnt)]));
    const picksDonePerSeat = seats.map(s => picksMap.get(s.id) ?? 0);
    const minPicks = Math.min(...picksDonePerSeat);
    const maxPicks = Math.max(...picksDonePerSeat);

    // Rotate all packs simultaneously only when every player has made the same number of picks
    if (minPicks === maxPicks) {
      const allPacks = await tx.select().from(packsTable).where(eq(packsTable.draftId, draftId));
      for (const pack of allPacks) {
        const direction = pack.packNumber % 2 === 1 ? 1 : -1;
        const curIdx = seats.findIndex(s => s.id === pack.currentSeatId);
        const nextIdx = ((curIdx + direction) + numSeats) % numSeats;
        await tx.update(packsTable).set({ currentSeatId: seats[nextIdx].id }).where(eq(packsTable.id, pack.id));
      }
    }

    txResult = { ok: true };
  });

  if (!txResult.ok) {
    res.status(txResult.code).json({ error: txResult.error });
    return;
  }

  // Check if the whole draft is now done
  const [pickCount] = await db
    .select({ count: count() })
    .from(picksTable)
    .where(and(eq(picksTable.draftId, draftId), eq(picksTable.seatId, seatId)));
  const picksDone = Number(pickCount?.count ?? 0);
  const totalPicks = draft.numPacks * draft.cardsPerPack;

  const [allPicksRow] = await db.select({ count: count() }).from(picksTable).where(eq(picksTable.draftId, draftId));
  const totalPicksNeeded = numSeats * totalPicks;
  const allPicksMade = Number(allPicksRow?.count ?? 0);

  let draftStatus: string = "active";
  if (allPicksMade >= totalPicksNeeded) {
    await db.update(draftsTable).set({ status: "completed" }).where(eq(draftsTable.id, draftId));
    draftStatus = "completed";
  }

  // Return updated seat state
  const newPackRow = await db
    .select()
    .from(packsTable)
    .where(and(eq(packsTable.draftId, draftId), eq(packsTable.currentSeatId, seatId)))
    .orderBy(packsTable.packNumber, packsTable.id)
    .limit(1);

  // Recompute per-seat pick counts for waitingForOthers after the transaction
  const postPickCounts = await db
    .select({ seatId: picksTable.seatId, cnt: count() })
    .from(picksTable)
    .where(eq(picksTable.draftId, draftId))
    .groupBy(picksTable.seatId);
  const postPicksMap = new Map(postPickCounts.map(p => [p.seatId, Number(p.cnt)]));
  const allSeatsForResponse = await db.select().from(seatsTable).where(eq(seatsTable.draftId, draftId));
  const minPostPicks = Math.min(...allSeatsForResponse.map(s => postPicksMap.get(s.id) ?? 0));
  const waitingForOthers = draftStatus === "active" && picksDone > minPostPicks;

  let currentPack: typeof cardsTable.$inferSelect[] = [];
  let packNumber = Math.min(Math.floor(picksDone / draft.cardsPerPack) + 1, draft.numPacks);
  let waitingForPack = false;
  let currentPackId: number | undefined;

  if (newPackRow.length) {
    const newCardIds: number[] = JSON.parse(newPackRow[0].cardIds);
    if (!waitingForOthers && newCardIds.length > 0) {
      currentPack = await db.select().from(cardsTable).where(inArray(cardsTable.id, newCardIds));
      const cardMap = new Map(currentPack.map(c => [c.id, c]));
      currentPack = newCardIds.map(id => cardMap.get(id)).filter(Boolean) as typeof cardsTable.$inferSelect[];
    }
    packNumber = newPackRow[0].packNumber;
    currentPackId = waitingForOthers ? undefined : newPackRow[0].id;
  } else if (draftStatus === "active" && allPicksMade < totalPicksNeeded) {
    waitingForPack = true;
  }

  res.json(MakePickResponse.parse({
    seat,
    currentPack,
    currentPackId,
    packNumber,
    picksDone,
    totalPicks,
    draftStatus,
    waitingForPack,
    waitingForOthers,
  }));
});

// Get player pool
router.get("/drafts/:id/pool/:seatId", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const rawSeatId = Array.isArray(req.params.seatId) ? req.params.seatId[0] : req.params.seatId;
  const draftId = parseInt(rawId, 10);
  const seatId = parseInt(rawSeatId, 10);

  const [seat] = await db.select().from(seatsTable).where(eq(seatsTable.id, seatId));
  if (!seat) {
    res.status(404).json({ error: "Seat not found" });
    return;
  }

  const picks = await db.select().from(picksTable).where(and(eq(picksTable.draftId, draftId), eq(picksTable.seatId, seatId)));
  const cardIds = picks.map(p => p.cardId);

  let cards: typeof cardsTable.$inferSelect[] = [];
  if (cardIds.length > 0) {
    cards = await db.select().from(cardsTable).where(inArray(cardsTable.id, cardIds));
  }

  res.json(GetPoolResponse.parse({ seat, cards }));
});

// Get draft summary
router.get("/drafts/:id/summary", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const draftId = parseInt(rawId, 10);

  const [draft] = await db.select().from(draftsTable).where(eq(draftsTable.id, draftId));
  if (!draft) {
    res.status(404).json({ error: "Draft not found" });
    return;
  }

  const seats = await db.select().from(seatsTable).where(eq(seatsTable.draftId, draftId)).orderBy(seatsTable.seatPosition);
  const totalPicks = draft.numPacks * draft.cardsPerPack;

  const [allPicksRow] = await db.select({ count: count() }).from(picksTable).where(eq(picksTable.draftId, draftId));
  const totalPicksMade = Number(allPicksRow?.count ?? 0);
  const totalPicksNeeded = seats.length * totalPicks;

  const seatSummaries = await Promise.all(seats.map(async (seat) => {
    const [pickRow] = await db.select({ count: count() }).from(picksTable).where(and(eq(picksTable.draftId, draftId), eq(picksTable.seatId, seat.id)));
    const picksDone = Number(pickRow?.count ?? 0);

    const [currentPack] = await db.select().from(packsTable).where(and(eq(packsTable.draftId, draftId), eq(packsTable.currentSeatId, seat.id))).limit(1);
    const waitingForPack = draft.status === "active" && !currentPack && picksDone < totalPicks;

    return { seat, picksDone, waitingForPack };
  }));

  res.json(GetDraftSummaryResponse.parse({
    draft,
    totalPicksMade,
    totalPicksNeeded,
    seatSummaries,
  }));
});

export default router;
