import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const draftsTable = pgTable("drafts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("waiting"), // waiting | active | completed
  numPacks: integer("num_packs").notNull(),
  cardsPerPack: integer("cards_per_pack").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDraftSchema = createInsertSchema(draftsTable).omit({ id: true, createdAt: true });
export type InsertDraft = z.infer<typeof insertDraftSchema>;
export type Draft = typeof draftsTable.$inferSelect;

export const seatsTable = pgTable("draft_seats", {
  id: serial("id").primaryKey(),
  draftId: integer("draft_id").notNull().references(() => draftsTable.id, { onDelete: "cascade" }),
  playerName: text("player_name").notNull(),
  seatPosition: integer("seat_position").notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSeatSchema = createInsertSchema(seatsTable).omit({ id: true, joinedAt: true });
export type InsertSeat = z.infer<typeof insertSeatSchema>;
export type Seat = typeof seatsTable.$inferSelect;

// Each pack is a list of card IDs stored as JSON
export const packsTable = pgTable("draft_packs", {
  id: serial("id").primaryKey(),
  draftId: integer("draft_id").notNull().references(() => draftsTable.id, { onDelete: "cascade" }),
  currentSeatId: integer("current_seat_id").notNull().references(() => seatsTable.id),
  originalSeatId: integer("original_seat_id").notNull(),
  packNumber: integer("pack_number").notNull(),
  cardIds: text("card_ids").notNull(), // JSON array of card IDs
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPackSchema = createInsertSchema(packsTable).omit({ id: true, createdAt: true });
export type InsertPack = z.infer<typeof insertPackSchema>;
export type Pack = typeof packsTable.$inferSelect;

export const picksTable = pgTable("draft_picks", {
  id: serial("id").primaryKey(),
  draftId: integer("draft_id").notNull().references(() => draftsTable.id, { onDelete: "cascade" }),
  seatId: integer("seat_id").notNull().references(() => seatsTable.id),
  cardId: integer("card_id").notNull(),
  packId: integer("pack_id").notNull().references(() => packsTable.id),
  pickedAt: timestamp("picked_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPickSchema = createInsertSchema(picksTable).omit({ id: true, pickedAt: true });
export type InsertPick = z.infer<typeof insertPickSchema>;
export type Pick = typeof picksTable.$inferSelect;
