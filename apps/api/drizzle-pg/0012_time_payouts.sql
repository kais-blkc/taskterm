CREATE TABLE "time_payouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"ms" integer NOT NULL,
	"hourly_rate" double precision NOT NULL,
	"currency" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"paid_by" integer,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "time_payouts" ADD CONSTRAINT "time_payouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_payouts" ADD CONSTRAINT "time_payouts_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "time_payouts_user_period" ON "time_payouts" USING btree ("user_id","period_from","period_to");