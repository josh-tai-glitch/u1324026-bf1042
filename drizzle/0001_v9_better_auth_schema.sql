-- V9 migration: Better Auth tables + orders.user_id 改為 text（指向 Better Auth user）
-- 舊的 users table 移除；orders 既有資料清空（integer user_id 與 UUID 不相容）

-- Step 1: 建立 Better Auth core tables
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
-- Step 2: 清空訂單資料（integer user_id 無法對應 Better Auth UUID）
TRUNCATE TABLE "orders" CASCADE;
--> statement-breakpoint
-- Step 3: 移除舊的 FK constraint
ALTER TABLE "orders" DROP CONSTRAINT "orders_user_id_users_id_fk";
--> statement-breakpoint
-- Step 4: 將 orders.user_id 從 integer 改為 text
ALTER TABLE "orders" ALTER COLUMN "user_id" TYPE text;
--> statement-breakpoint
-- Step 5: 新增 FK 指向 Better Auth user 表
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_user_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Step 6: Better Auth session / account FK
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Step 7: indexes
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_idx" ON "account" USING btree ("provider_id","account_id");
--> statement-breakpoint
-- Step 8: 移除舊的示範型 users table（已由 Better Auth 接管）
DROP TABLE "users";
