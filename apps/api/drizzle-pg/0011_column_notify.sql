CREATE TABLE "column_notify_users" (
	"column_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	CONSTRAINT "column_notify_users_column_id_user_id_pk" PRIMARY KEY("column_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "columns" ADD COLUMN "notify_on_enter" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "column_notify_users" ADD CONSTRAINT "column_notify_users_column_id_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."columns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "column_notify_users" ADD CONSTRAINT "column_notify_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;