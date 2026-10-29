CREATE TYPE "public"."event_status" AS ENUM('draft', 'published', 'cancelled');--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oganizer_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"venue" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"sale_starts_at" timestamp with time zone NOT NULL,
	"status" "event_status" DEFAULT 'draft' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
