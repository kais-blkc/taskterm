CREATE TABLE "board_members" (
	"board_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_members_board_id_user_id_pk" PRIMARY KEY("board_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "board_members" ADD CONSTRAINT "board_members_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_members" ADD CONSTRAINT "board_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- перенос существующих данных: создатель доски — owner, остальные пользователи — editor (как было: все могли всё)
INSERT INTO "board_members" ("board_id", "user_id", "role")
SELECT b."id", u."id", CASE WHEN u."id" = b."created_by" THEN 'owner' ELSE 'editor' END
FROM "boards" b CROSS JOIN "users" u;
