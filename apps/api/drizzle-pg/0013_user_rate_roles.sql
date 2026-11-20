ALTER TABLE "users" ADD COLUMN "hourly_rate" double precision DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- у каждого — своя ставка; стартуем с прежней общей (по умолчанию 10)
UPDATE "users" SET "hourly_rate" = COALESCE((SELECT "value"::double precision FROM "app_settings" WHERE "key" = 'time.rate'), 10);
--> statement-breakpoint
DELETE FROM "app_settings" WHERE "key" = 'time.rate';
--> statement-breakpoint
-- владелец (главный админ) — самый старый админ
UPDATE "users" SET "role" = 'owner' WHERE "id" = (SELECT MIN("id") FROM "users" WHERE "role" = 'admin');
