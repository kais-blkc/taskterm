ALTER TABLE "chat_reads" ADD COLUMN "muted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD COLUMN "position" text DEFAULT 'a0' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD COLUMN "is_general" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- существующая общая комната становится темой General (закреплена); добавляем Tasks и Guide
UPDATE "chat_rooms" SET "name" = 'General', "position" = 'a0', "is_general" = true WHERE "slug" = 'general';
--> statement-breakpoint
INSERT INTO "chat_rooms" ("slug", "name", "position") VALUES ('tasks', 'Tasks', 'a1'), ('guide', 'Guide', 'a2') ON CONFLICT DO NOTHING;
