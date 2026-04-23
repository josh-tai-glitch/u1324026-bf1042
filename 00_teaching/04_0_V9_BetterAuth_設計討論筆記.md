# V9 Better Auth + Google 認證：設計討論筆記

> 這份筆記紀錄 V9 實作前的設計討論過程。
> 討論本身就是教學——包括問對問題、找出鐵律、確認優先順序。
> 最終結論會在實作完成後整理成正式講義。

---

## 背景

V8 已完成：

- Drizzle + Neon PostgreSQL 跑通
- Render 部署接好 `DATABASE_URL`
- 業務 table（menu_items、orders、order_items）已上線

V9 目標：

- 導入 Better Auth + Google OAuth
- 把整個系統從「示範型登入」升級成「真正由 session 驗證的 auth 架構」

---

## 先看全貌：Better Auth 在這個專案怎麼運作

先有這張地圖，再看後面步驟會比較不會迷路。

### 一句話版本

- 使用者在前端點 Google 登入
- 請求交給 Better Auth 的 `/api/auth/*` handler
- Better Auth 與 Google 完成 OAuth 後，建立/更新 `user`、`account`、`session`
- 後續 API 透過 session 驗證辨識目前使用者，不再由前端傳 `userId`

### 核心流程圖（概念層）

```text
Browser(前端)
  │ 1) 點擊 Google 登入
  ▼
Elysia /api/auth/*
  │ 2) 委派給 auth.handler(request)
  ▼
Better Auth
  │ 3) 導向 Google OAuth，同意後 callback
  ▼
Google OAuth
  │ 4) 回傳授權結果
  ▼
Better Auth
  │ 5) 寫入/更新 user, account, session
  ▼
PostgreSQL (Drizzle)
  │ 6) 發出 session cookie
  ▼
Browser
  │ 7) 之後呼叫 /api/orders/* 自動帶 cookie
  ▼
Elysia 業務 API
  │ 8) 讀 session -> 取得 userId -> 執行業務邏輯
```

### 教學上要先釐清的三件事

1. Auth 與業務分層：
   `/api/auth/*` 由 Better Auth 負責；`/api/orders/*` 等業務 API 只負責「已登入使用者」的業務邏輯。

2. 身分來源改變：
   V8 由前端傳 `userId`；V9 改為「後端從 session 取 userId」。

3. 資料表責任分離：
   `user/account/session` 是認證資料；`orders/order_items/menu_items` 是業務資料。

### 為什麼先看全貌再做步驟

- 先知道每一步在解哪一段流程，不會只是在背操作。
- 出錯時能定位在「OAuth 交握」、「session 建立」、「cookie 傳遞」或「業務 API 驗證」哪一層。
- 後續的待辦順序（後端 → 環境 → 前端 → 清理）就有明確依據。

### 故障定位地圖（教學實用版）

```text
症狀 A: 點了 Google 登入沒反應 / 直接 404
  -> 先看 Elysia 是否有掛 /api/auth/*
  -> 再看前端呼叫的 URL 是否指到正確後端

症狀 B: Google 同意後 callback 失敗
  -> 檢查 Google Cloud redirect URI 是否與後端設定一致
  -> 檢查 BETTER_AUTH_URL 是否為實際可回呼的網址

症狀 C: 看起來登入成功，但後續 API 還是 401
  -> 檢查 cookie 是否有被瀏覽器保存
  -> 檢查 CORS 與 cookie 設定（origin、credentials、sameSite）
  -> 檢查後端是否真的從 session 取 userId

症狀 D: session 有了，但 /api/orders/* 還拿不到使用者
  -> 檢查業務 route 是否仍使用 query.userId
  -> 應改為以 session 身分為唯一來源
```

最短排查路徑：

1. 先看路由有沒有接上（`/api/auth/*`）
2. 再看 OAuth 回呼網址對不對（Google + `BETTER_AUTH_URL`）
3. 再看 cookie 有沒有成功往返
4. 最後看業務 API 是否已改為 session 驗證

---

## 第一個問題：容易搞混的起手問題

> 「切換到自己的 branch，就可以看到那個版本，然後 bun dev 跑起來嗎？」

**是的。** 每條 branch 都是獨立可執行的版本快照。切到哪條，就跑哪個版本，互不干擾。

這正是「main 保留乾淨基線 + 功能另開 branch」策略的核心價值。

---

## 第二個問題：V9 branch 要從哪裡切出來？

> 「main 還沒 merge V8，可以從 V8 branch 再開 V9 嗎？」

可以，但有兩種選擇：

| 情況                         | 建議起點                             |
| ---------------------------- | ------------------------------------ |
| V8 已穩定，想保持歷史線清楚  | 先 merge V8 進 main，再從 main 切 V9 |
| V8 還在進行中，想提前試做 V9 | 直接從 feat/v8 切出 V9               |

**場景建議：先 merge V8 進 main，再切 V9。** 每個版本邊界清楚，學生回顧時才看得懂歷史。

本次操作：V8 已穩定，從 main 切出：

```bash
git switch main
git switch -c feat/v9-better-auth
```

---

## 核心鐵律：單一事實的層次順序

這是 V9 最重要的設計原則，也是整個專案架構守住的鐵律。

> 「首先要守住的鐵律是前後端共用的單一事實，包括 shared/contracts.ts 以及 Elysia 的 API。Drizzle 要根據這兩個事實做資料庫 schema 並優化。」

**層次順序如下：**

```
shared/contracts.ts（型別定義）
    ↓ 決定
Elysia API（route schema、input/output 型別）
    ↓ 決定
db/schema.ts（資料庫欄位與關聯）
```

### 為什麼這個順序是對的？

- `contracts.ts` 是前後端「說好的語言」，是最上游的事實
- Elysia API 根據這份契約定義邊界，不能自己發明型別
- Drizzle schema 是實作細節，根據業務需求設計，**不讓資料庫結構反過來污染 API 契約**

反過來（從 DB schema 往上推）的問題：

- DB 欄位命名（snake_case）會滲入 API
- DB 的實作限制（型別、FK 設計）會干擾 API 語意
- 前後端契約變成「DB 長什麼樣，API 就長什麼樣」，失去彈性

---

## V9 的型別衝突：現況 vs 應有

查看現況後，這個鐵律立刻暴露出需要修改的地方：

### contracts.ts 現況

```ts
export interface User {
  id: number;      // ← 問題：Better Auth 的 user.id 是 string
  email: string;
  name: string;
  password: string; // ← 問題：password 不應出現在前後端契約
}

export interface Order {
  id: number;
  userId: number;  // ← 問題：應改成 string，對應 Better Auth user.id
  ...
}
```

### db/schema.ts 現況

```ts
export const usersTable = pgTable("users", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  password: text("password").notNull(), // ← 這整張表導入 Better Auth 後要移除
});

export const ordersTable = pgTable("orders", {
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id), // ← FK 要改掉
  ...
});
```

### V9 應有的狀態

| 位置                                  | 現況                      | V9 後                            |
| ------------------------------------- | ------------------------- | -------------------------------- |
| `contracts.ts` → `User.id`            | `number`                  | `string`                         |
| `contracts.ts` → `User.password`      | 存在                      | 移除                             |
| `contracts.ts` → `Order.userId`       | `number`                  | `string`                         |
| `db/schema.ts` → `usersTable`         | 自建，有 password         | 移除，改由 Better Auth 管理      |
| `db/schema.ts` → `ordersTable.userId` | `integer` FK → usersTable | `text`，指向 Better Auth user.id |

---

## 修改優先順序

**contracts.ts 先改 → Elysia route 跟著對齊 → db/schema.ts 最後調整**

這個順序對應鐵律：最上游的事實先確立，下游跟著調整。

### 為什麼實作時看起來會變成「先動資料庫」？

這裡要分清楚兩種順序：

1. 決策順序（設計層）：
   `contracts.ts` → Elysia API 契約 → db/schema.ts
2. 施工順序（實作層）：
   會交錯進行，常見是 contracts 先改後，先補最小必要 DB，再把 API 全部接回來

兩者不衝突，重點只有一個：

- DB 可以先做「支撐性實作」，但不能反過來改寫 API 契約

### 目前採用的 V9 執行流程（共識版）

1. 先把 V9 API 規格寫清楚（輸入、輸出、401/403 規則）
2. 再做資料庫最小必要變更（例如 `orders.user_id` 改為 string，補 auth tables）
3. 接著逐支實作 Elysia route，全部對齊規格
4. 最後做一致性檢查（contracts、API、schema 三方比對）

這樣既守住「契約優先」鐵律，也避免因為資料庫未到位而卡住後續實作。

---

## 新決策：User 與 SessionUser 必須分離

討論結論：

- `User` 與 `SessionUser` 不合併，維持兩個型別

原因：

- `SessionUser` 的責任是「當前登入身份」，欄位應保持最小集合（`id`、`email`、`name`）
- `User` 是業務領域資料，未來可能加入 `phone`、`address` 等欄位
- 若現在混在同一型別，未來擴充後勢必又要拆開，會造成重構成本與教學干擾

已落地到 `shared/contracts.ts`：

- `User.id` 改為 `string`
- `User.password` 已移除
- `User` 預留可擴充欄位：`phone?`、`address?`
- 新增 `SessionUser`
- `Order.userId` 改為 `string`

---

## V9 API 規格草案（先定義，再實作）

這份草案的目的不是直接寫程式，而是先固定 API 契約，讓後續 DB 與 Elysia 的修改有明確依據。

### A. Auth 路由（由 Better Auth 提供）

由 Better Auth 接管 `/api/auth/*`，不再保留舊的 `POST /api/auth/login`。

核心端點（概念層）：

- `GET/POST /api/auth/*`：交由 Better Auth handler 處理（登入、callback、session、登出）

教學上需固定的觀念：

- 前端不再送 email/password 到自製 API
- 使用者身份來源是 cookie session，不是前端自行宣告的 userId

### B. 訂單路由（V9 契約）

以下以「使用 server session 判定目前使用者」為前提。

1. `GET /api/orders/current`

- Query: 無 `userId`
- 200: `{ data: OrderResponse | null }`
- 401: 未登入

2. `GET /api/orders/history`

- Query: 無 `userId`
- 200: `{ data: OrderResponse[] }`
- 401: 未登入

3. `POST /api/orders`

- Body: 無 `userId`
- 200/201: `{ data: OrderResponse }`
- 401: 未登入

4. `GET /api/orders/:id`

- Params: `id`
- 200: `{ data: OrderResponse }`
- 401: 未登入
- 403: 已登入但訂單不屬於自己
- 404: 訂單不存在

5. `PATCH /api/orders/:id`

- Params: `id`
- Body: `{ itemId: number, qty: number }`（不含 `userId`）
- 200: `{ data: OrderResponse }`
- 401: 未登入
- 403: 已登入但訂單不屬於自己
- 404: 訂單或品項不存在
- 409: 訂單不可編輯

6. `POST /api/orders/:id/submit`

- Params: `id`
- Body: 無 `userId`
- 200: `{ data: OrderResponse }`
- 401: 未登入
- 403: 已登入但訂單不屬於自己
- 404: 訂單不存在
- 409: 訂單已提交不可再送

### C. 狀態碼邊界（課堂要明講）

- `401 Unauthorized`：沒有有效 session（未登入或 session 失效）
- `403 Forbidden`：有 session，但資源不屬於該使用者
- `404 Not Found`：資源不存在
- `409 Conflict`：資源狀態不允許此操作（例如已提交訂單再修改）

### D. 與目前 V8 API 的差異對照

- 移除：`POST /api/auth/login`
- 移除：所有 orders API 的 `query.userId`、`body.userId`
- 新增：未登入狀態要統一回 `401`
- 保留：訂單擁有權檢查，但改由 `session.user.id` 驗證

---

## 術語釐清：這裡說的 DB 層是什麼？

在這個專案語境下，討論「DB 層」時，主要指的是 Drizzle schema，也就是 `db/schema.ts`。

但完整的 DB 層其實有三個部分：

1. 結構定義：`db/schema.ts`
2. 遷移流程：`drizzle/` 與 migration 指令（產生/套用）
3. 存取實作：`store/pg/PgStore.ts`

V9 目前優先聚焦在第 1 部分（schema），因為要先完成：

- Better Auth 相關 tables（`user` / `account` / `session`）
- `orders.user_id` 改為 `string`（對齊 session user id）
- 移除舊示範型 `users/password` 模型

先把 schema 對齊契約，再往下接 migration 與資料存取實作，流程會最穩。

---

## 下一步已落地：Better Auth schema 先併入、舊 users 暫留

為了同時達成「往 V9 前進」與「不把現有流程一次打壞」，本次先採過渡期雙軌策略：

- 已在 `db/schema.ts` 新增 Better Auth 核心 tables：
  - `user`
  - `session`
  - `account`
- 目前暫時保留舊的 `users` table（示範型 email/password）

為什麼先暫留舊 `users`？

- 目前 `PgStore` 與既有 route 仍依賴舊登入流程
- 若在同一個 commit 同時移除舊 `users`，會讓現有 API 立即失效
- 教學上也能清楚示範「先並存、再切換、最後移除」的安全遷移路徑

下一個拆除時機（很重要）：

- 等 Elysia 的 orders API 全部改成 session 判定
- 等舊 `POST /api/auth/login` 完全移除
- 等 store 端不再依賴 `users/password`

屆時再刪除舊 `users` table 與相關程式碼，才是低風險收斂。

---

## 下一步已落地：auth.ts 單一入口（Drizzle adapter + Google provider）

本步驟已新增 `auth.ts`，作為 V9 auth 系統的單一設定入口。

### 執行紀錄（套件安裝）

- 已執行：`bun install`
- 結果：安裝成功（含 `better-auth`）

### 這一步做了什麼

- 建立 `betterAuth({...})`
- 透過 `drizzleAdapter` 接到既有 `db`（Neon + Drizzle）
- 明確綁定 auth tables：`user` / `session` / `account`
- 設定 `socialProviders.google`
- 加入環境變數檢查（fail-fast）
- 支援可選的 `BETTER_AUTH_TRUSTED_ORIGINS`

### 為什麼要這樣設計

1. 單一入口：
   不把 auth 設定散落在 `backend.ts`，降低後續調整成本。

2. fail-fast：
   啟動時就檢查 `BETTER_AUTH_URL`、`BETTER_AUTH_SECRET`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`，避免服務跑起來才在 callback 階段才爆錯。

3. 明確 schema 綁定：
   直接指定 Better Auth 使用哪幾張表，避免隱式推斷造成 migration 與 runtime 不一致。

4. trusted origins 可選化：
   本機與部署環境常有不同網域，透過 `BETTER_AUTH_TRUSTED_ORIGINS`（逗號分隔）可彈性配置，不強迫寫死。

### 目前邊界（尚未完成）

- `backend.ts` 尚未掛入 Better Auth handler
- 舊 `/api/auth/login` 尚未移除
- 訂單 API 尚未改成 session 取 user

也就是說：本步先完成「auth 引擎設定」，下一步才是把它接進 Elysia 路由層。

---

## Elysia 掛入 Better Auth handler（已完成）

### 實作內容

在 `backend.ts` 中：

```ts
// 新增導入
import { auth } from "./auth.ts";

// 新增路由：所有 /api/auth/* 請求都由 Better Auth 處理
app.all(
  "/api/auth/*",
  async ({ request }) => {
    return auth.handler(request);
  },
  {
    detail: {
      tags: ["auth"],
      summary: "Better Auth handler",
      description: "Handles OAuth callbacks, session validation, etc.",
      hide: true,
    },
  },
);

// 移除舊的 POST /api/auth/login 路由
// （使用 store.login() 的示範 auth 已淘汰）
```

### 執行結果

- ✅ `import { auth } from "./auth.ts"` 新增到頂部
- ✅ `/api/auth/*` 萬用路由新增（所有 auth 請求由 Better Auth 委託處理）
- ✅ 舊的 POST `/api/auth/login` 已刪除
- ✅ `safeUserSchema` 已更新：`id: t.String()` 而非 `t.Number()`
- ✅ backend.ts 編譯通過，無型別錯誤

### 為什麼這樣做

1. **委託處理**：Better Auth 內建 OAuth callback、session 驗證、signup/signin 等流程，不須我們再寫一遍。直接 `auth.handler(request)` 回傳 Response 物件。

2. **Bun Web API 相容**：Elysia 執行在 Bun 上，原生支援 Web Request/Response API，與 Better Auth 的介面相容。

3. **移除示範 auth**：舊的 email/password 登入已被新的 OAuth 流程取代，刪除可避免混淆。

4. **ID 型別一致**：Better Auth 用 UUID (string)，`safeUserSchema` 改成 `t.String()` 才能接收。

### 邊界注意

- `backend.ts` 本身現在沒有任何登入邏輯，所有 auth 流程由 Better Auth 負責
- 訂單 API 仍未改成 session 驗證，仍需查詢參數帶 userId（下一步）
- 前端仍需建立 OAuth 登入按鈕與 callback 頁面（前端任務）

---

## 重新決策：不採過渡橋接，直接乾淨收斂

> ⚠️ 注意：以下是一個**曾被考慮但最終放棄**的設計方向，保留作為教學反例。

### 最初考慮的橋接策略

初版實作引入了 `LegacyUser`/`LegacyOrder` 內部型別，在 store 邊界用 `toPublicUser()`/`toPublicOrder()` 把 DB 的 `integer id` 轉換成對外的 `string id`。

### 為什麼放棄橋接策略

這個策略本質上是在用程式碼掩蓋技術債，而不是解決它：

1. **它是謊言**：DB 的 `integer id` 被轉成 `String(1)` 後對外稱為「UUID-compatible string」，但 Better Auth 真正產生的 id 是真正的 UUID，兩者根本不同
2. **兩套心智模型**：維護者要同時記住「內部是 number、外部是 string」，不必要的認知負擔
3. **橋接層本身是壞味道**：`session.user.id` → email → `getUserByEmail()` → `Number(storeUser.id)` → 傳入業務，這個往返轉換暴露了系統的混亂
4. **爾後清理成本更高**：等真正做 migration 時，還要同時移除橋接層與轉換函數

### 正確決策：接受必要成本，一次做乾淨

> V9 接入 Better Auth，`users.id` 就是 string（UUID）。這不是可以過渡的，這是事實。系統應該反映這個事實，而不是用橋接層假裝它還沒發生。

這個決策驅動了後面三個一起做的 migration 動作。

---

## 已落地：DB 乾淨收斂 + 訂單 API 改為 session 驗證

這是捨棄橋接策略後，一次性做乾淨的三個動作。

### 動作 1：db/schema.ts 乾淨化

**移除：** 舊示範型 `usersTable`（integer id + password）

**修改：** `ordersTable.userId` 從 `integer FK → usersTable` 改為 `text FK → authUsersTable`

```ts
// 修改前（V8）
export const ordersTable = pgTable("orders", {
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  // ...
});

// 修改後（V9）
export const ordersTable = pgTable("orders", {
  userId: text("user_id")
    .notNull()
    .references(() => authUsersTable.id),
  // ...
});
```

### 動作 2：store/Store.ts 介面乾淨化

移除：`login()`、`getUserById()`、`getUserByEmail()`、`LoginErrorCode`

所有 `userId: number` 參數改為 `userId: string`

```ts
// 修改後（乾淨的 V9 介面）
getCurrentOrderByUserId(userId: string): Order | undefined;
getOrderHistoryByUserId(userId: string): ReadonlyArray<Order>;
createOrder(input: { userId: string }): Promise<Order>;
updateOrderItem(orderId: number, input: { userId: string; ... }): Promise<...>;
submitOrder(orderId: number, input: { userId: string }): Promise<...>;
```

### 這一步的設計判斷很重要：Store abstraction 保留，但 auth responsibility 移出

這裡不是把 Store 整個推翻重做，而是把它**收斂回原本應該承擔的責任**。

當初設計 Store 介面的目的，本來就是為了讓上層業務邏輯不要綁死在某一種資料來源上。也就是說，不論底層是 JsonFileStore 還是 PgStore，route handler 都應該透過同一組業務存取介面工作。從這個角度看，**V9 確實應該沿用 Store abstraction**。

但要注意，沿用的是「抽象層」，不是「舊有的所有方法都原封不動保留」。

V8 時期 `login()`、`getUserById()`、`getUserByEmail()` 之所以存在，是因為當時的示範登入流程把 auth 與業務資料混在一起；一旦 V9 正式導入 Better Auth，登入、session、OAuth provider、account 綁定這些責任，就都不再屬於 Store，而是屬於 Better Auth。

因此，這次不是「Store 被取消」，而是：

```text
保留：Store 作為業務資料存取邊界
移出：Store 內的 auth / session / user lookup responsibility
改由：Better Auth 負責身份，backend route 負責把 session.user.id 傳進 Store
```

這樣的分層才符合 V9 的乾淨架構：

```text
Better Auth
  └─ 管 user / account / session / OAuth

Store
  └─ 管 menu / orders / order_items

backend route
  └─ 讀 session，取得 userId，呼叫 Store
```

所以，教學上更精準的說法不是「V9 要沿用舊的 Store 內容」，而是：

> V9 要沿用 Store 這個 abstraction，但同時把它清理成只承擔業務資料存取責任。

這也是為什麼這次看起來像是「刪掉一些方法」，實際上卻是在**讓架構更接近當初設計 Store abstraction 的初衷**。

### 動作 3：store/pg/PgStore.ts 乾淨化

移除：`LegacyUser`、`LegacyOrder`、`toPublicUser()`、`toPublicOrder()`、`login()`、`getUserById()`、`getUserByEmail()`、`users` 私有陣列、`reloadFromDatabase` 中的 user loading

`orders` 私有陣列直接用 `Order[]`（`Order.userId` 已是 string），不再需要任何轉換。

### 動作 4：Drizzle migration（0001_v9_better_auth_schema.sql）

手動撰寫 migration SQL，一次完成以下動作：

1. 建立 Better Auth 三張 table（`user`、`session`、`account`）
2. `TRUNCATE orders CASCADE`（integer userId 資料無法對應 UUID，清空最乾淨）
3. `ALTER TABLE orders DROP CONSTRAINT orders_user_id_users_id_fk`
4. `ALTER TABLE orders ALTER COLUMN user_id TYPE text`
5. 新增 FK：`orders.user_id → user.id`
6. 新增 session / account 的 FK 與 index
7. `DROP TABLE users`（示範型 users 完全移除）

### 動作 5：backend.ts — getAuthenticatedStoreUser 乾淨化

不再需要橋接，helper 只剩一個職責：確認 session 存在。

```ts
async function getAuthenticatedStoreUser(
  request: Request,
): Promise<
  { ok: true; userId: string } | { ok: false; status: 401; error: string }
> {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user?.id) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true, userId: session.user.id };
}
```

### 資料流圖（乾淨版）

```text
Request (有 cookie)
  │
  ▼ auth.api.getSession()
Better Auth session
  │ session.user.id  ← 直接就是 DB 的 user.id（UUID text）
  ▼
業務邏輯（查訂單、建訂單...）
```

### 所有訂單路由的修改模式

六支訂單 API 全部套用相同模式：

```ts
// 修改前（V8 模式）
const userId = Number(query.userId); // 或 body.userId

// 修改後（V9 乾淨模式）
const authResult = await getAuthenticatedStoreUser(request);
if (!authResult.ok) {
  set.status = authResult.status;
  return { error: authResult.error };
}
const { userId } = authResult; // userId: string，直接傳入 store
```

### 伴隨修改

- `orderResponseSchema.userId` 從 `t.Number()` 改為 `t.String({ minLength: 1 })`（對齊 contracts）
- 訂單擁有者比對：`order.userId !== authResult.userId`（純 string 比對，不需要 `Number()` 轉換）

---

## 已落地：V9 Runtime 收斂為 PostgreSQL-only

### 決策脈絡

V8 使用 `STORE_DRIVER` 環境變數，讓 runtime 可以在 `JsonFileStore` 與 `PgStore` 之間切換。這在 V8 有教學價值——學生能看到兩個 store 的對比。

但 V9 有充分理由把 JsonFileStore 完全移出 runtime：

1. **V8 已完成 JsonFileStore 教學**，V9 沒有必要繼續維護兩條真相來源
2. **兩條真相的維護成本**：每次修改業務邏輯，都要確認 JsonFileStore 與 PgStore 行為一致
3. **V9 的核心是 Better Auth + PostgreSQL**，雙軌反而模糊教學焦點

### 三個檔案的改動

**`store/index.ts`（完全改寫）**

```ts
// V8 版本（已移除）
// const driver = process.env.STORE_DRIVER;
// if (driver === "postgres") return new PgStore(options);
// return new JsonFileStore(options);

// V9 版本（只剩 PgStore）
import { PgStore } from "./pg/PgStore.ts";
import type { Store } from "./Store.ts";

export function createStore(): Store {
  return new PgStore();
}
export type { Store } from "./Store.ts";
```

**`store/pg/PgStore.ts`（移除 seed 相關）**

移除項目：

- `PgStoreOptions` interface（含 `seedFilePath` 選項）
- `SeedStore` interface（seed 資料結構）
- `normalizeSeedData()` 函數
- `seedFromJsonIfEmpty()` 方法
- constructor 從 `constructor(options?: PgStoreOptions)` 改為 `constructor() {}`
- `init()` 不再呼叫 `seedFromJsonIfEmpty`

理由：V9 預期 DB 已由 migration 建立基礎資料，或由 `scripts/migrate-json-to-db.ts` 先匯入，不再需要 runtime seed。

**`backend.ts`**

```ts
// V8
const store = createStore({ seedFilePath: ... });

// V9
const store = createStore();
```

### JsonFileStore 的定位

`store/json/JsonFileStore.ts` **保留在 repo 中**，但不再被 V9 runtime 引用：

- 作為 V2–V8 版本的歷史對照
- 教學上可比較「記憶體 JSON store」與「PostgreSQL store」的差異
- 未來清理時再考慮移除

---

## 進度看板

### 已完成

1. contracts.ts 修改內容確認
2. V9 API 規格草案（含 401/403 邊界）
3. Better Auth schema（user / account / session table）加入 db/schema.ts
4. auth.ts 單一入口（Drizzle adapter + Google provider）
5. Elysia 掛入 Better Auth handler
6. V9 runtime 收斂為 PostgreSQL-only（store/index.ts、PgStore 移除 seed 路徑）
7. DB 乾淨收斂（orders.user_id 改 text、舊 users table 移除、Drizzle migration 套用）
8. PgStore 乾淨化（移除 LegacyUser/LegacyOrder/橋接函數，直接使用 string userId）
9. Store 介面乾淨化（移除 login/getUserById/getUserByEmail，所有 userId 改 string）
10. 訂單 API 全部改為 session 驗證（getAuthenticatedStoreUser 直接回傳 session.user.id）

### 下一步（優先）

1. Google Cloud Console 設定（OAuth 憑證、redirect URI）

---

## 實作順序與依賴關係

為什麼下面的順序很重要？

- **訂單 API 優先**：前端測試 OAuth 登入時，需要後端的 session 驗證機制已完成，否則無法驗證整個流程
- **環境配置在前**：Google Cloud / CORS / 環境變數 setup 必須先到位，前端才有完整的 OAuth 端點可呼叫
- **前端在後**：前端的 OAuth 按鈕與 callback 頁面是依賴後端的，後端穩定後前端才有東西可整合
- **清理在最後**：移除舊的示範 auth 是收尾，不影響前後端開發進度

簡言之：**後端 → 環境 → 前端 → 清理**

### 核心邏輯視覺化

```
後端 (訂單 API session 驗證)
  ↓
環境 (Google Cloud、CORS、env vars)
  ↓
前端 (OAuth 登入、callback 頁面)
  ↓
清理 (移除舊 auth)
```

每一層都是下一層的前置條件，順序不能亂。

---

## 待進行

1. Google Cloud Console 設定步驟（OAuth 憑證、redirect URI）
2. 環境變數配置完全（BETTER_AUTH_URL、BETTER_AUTH_SECRET、GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET）
3. CORS / cookie 跨域設定（Elysia + Vite 分開跑時）
4. **前端 OAuth 登入按鈕與 callback 頁面建立**（等後端穩定後再進行）
5. 移除舊 users table 與 store 端的示範 auth（收尾）
