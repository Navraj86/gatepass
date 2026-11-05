CREATE TYPE "public"."order_status" AS ENUM('pending', 'paid', 'expired', 'cancelled', 'failed', 'refunding', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('valid', 'refunded');--> statement-breakpoint
CREATE TABLE "order_items" (
	"order_id" uuid NOT NULL,
	"seat_id" uuid NOT NULL,
	"price_minor" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_order_id_seat_id_pk" PRIMARY KEY("order_id","seat_id"),
	CONSTRAINT "order_items_price_non_negative" CHECK ("order_items"."price_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"event_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"dodo_session_id" text,
	"dodo_payment_id" text,
	"checkout_url" text,
	"expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"charged_amount_minor" integer,
	"charged_currency" text,
	"charged_tax_minor" integer,
	"failure_code" text,
	"dodo_refund_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_dodo_session_id_unique" UNIQUE("dodo_session_id"),
	CONSTRAINT "orders_dodo_payment_id_unique" UNIQUE("dodo_payment_id"),
	CONSTRAINT "orders_amount_positive" CHECK ("orders"."amount_minor" > 0),
	CONSTRAINT "orders_paid_at_matches_status" CHECK (("orders"."status" in ('paid', 'refunding', 'refunded')) = ("orders"."paid_at" is not null)),
	CONSTRAINT "orders_charged_pair" CHECK (("orders"."charged_amount_minor" is null) = ("orders"."charged_currency" is null))
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"seat_id" uuid NOT NULL,
	"code" text NOT NULL,
	"status" "ticket_status" DEFAULT 'valid' NOT NULL,
	"scanned_at" timestamp with time zone,
	"scanned_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_code_unique" UNIQUE("code"),
	CONSTRAINT "tickets_scan_pair" CHECK (("tickets"."scanned_at" is null) = ("tickets"."scanned_by" is null)),
	CONSTRAINT "tickets_no_refund_after_scan" CHECK (not ("tickets"."status" = 'refunded' and "tickets"."scanned_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "currency" SET DEFAULT 'USD';--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_seat_id_seats_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seats"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_seat_id_seats_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seats"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_one_pending_per_user_event" ON "orders" USING btree ("user_id","event_id") WHERE "orders"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "orders_user_id_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "orders_event_id_idx" ON "orders" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_one_valid_per_seat" ON "tickets" USING btree ("seat_id") WHERE "tickets"."status" = 'valid';--> statement-breakpoint
CREATE INDEX "tickets_event_id_idx" ON "tickets" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "tickets_order_id_idx" ON "tickets" USING btree ("order_id");