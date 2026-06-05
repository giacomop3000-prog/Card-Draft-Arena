import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, cardsTable } from "@workspace/db";
import {
  ListCardsResponse,
  CreateCardBody,
  DeleteCardParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/cards", async (req, res): Promise<void> => {
  const cards = await db.select().from(cardsTable).orderBy(cardsTable.createdAt);
  res.json(ListCardsResponse.parse(cards));
});

router.post("/cards", async (req, res): Promise<void> => {
  const parsed = CreateCardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [card] = await db.insert(cardsTable).values(parsed.data).returning();
  res.status(201).json(card);
});

router.delete("/cards/:id", async (req, res): Promise<void> => {
  const params = DeleteCardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(cardsTable)
    .where(eq(cardsTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Card not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
