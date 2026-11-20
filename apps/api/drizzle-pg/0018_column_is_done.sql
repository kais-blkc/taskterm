ALTER TABLE "columns" ADD COLUMN "is_done" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- до этого «выполнено» была последняя колонка: сохраняем это поведение для существующих досок
UPDATE "columns" SET "is_done" = true WHERE "id" IN (SELECT DISTINCT ON ("board_id") "id" FROM "columns" ORDER BY "board_id", "position" COLLATE "C" DESC);
