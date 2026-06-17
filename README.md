# 早餐店訂餐系統

這是一套以早餐店實際營運流程為核心設計的訂餐與後台管理系統。系統把「顧客點餐、店員接單、廚房製作、老闆管理、系統管理者權限控管」串成同一套流程，目標不是只做出菜單頁面，而是讓早餐店可以從接單到出餐、促銷、庫存與營運分析都在同一個網站內完成。

## 1. 線上展示與程式碼

| 項目 | 內容 |
|---|---|
| 線上展示網站 | https://u1324026-bf1042.onrender.com/ |
| GitHub Repository | https://github.com/josh-tai-glitch/u1324026-bf1042.git |
| 專案類型 | 早餐店訂餐系統 / 期末專題 |
| Runtime | Bun |
| 前端 | React 19、Vite、Tailwind CSS、DaisyUI |
| 後端 | Elysia |
| 資料庫 | PostgreSQL / Neon |
| ORM | Drizzle ORM |
| 認證 | Better Auth、Google OAuth、Demo Login |

---

## 2. 系統可以解決的問題

傳統早餐店常見問題包括：電話訂單容易漏記、現場與線上訂單分散、廚房不知道訂單優先順序、老闆不容易掌握熱銷商品、優惠券成效與缺料商品。本系統將這些流程整合在同一套平台中。

| 店家問題 | 系統解法 |
|---|---|
| 顧客不想註冊，導致線上點餐門檻高 | 支援訪客訂餐，只需留下姓名與電話即可下單。 |
| 電話與現場訂單容易寫在紙上，造成漏單 | 店員可在後台建立現場或電話訂單，並進入同一套訂單流程。 |
| 廚房不知道目前哪些訂單要先做 | 廚房看板集中顯示待製作與製作中訂單。 |
| 老闆不知道哪些商品賣得好 | 後台提供營運分析、熱銷商品、訂單來源與優惠券成效。 |
| 原料缺貨時，顧客仍可能點到無法製作的餐點 | 庫存管理可分析缺料影響，並同步下架無法製作的商品。 |
| 不同人員權限混在一起，容易誤改資料 | 以 customer、staff、chef、owner、admin 分工管理。 |

---

## 3. 使用者角色與操作範圍

| 角色代碼 | 中文身份 | 主要操作 |
|---|---|---|
| `customer` | 顧客 | 線上點餐、查看自己的訂單、再次訂購、查看常點品項。 |
| `staff` | 店員 | 建立現場 / 電話訂單、處理付款、取消訂單、協助查詢、調整基本庫存。 |
| `chef` | 廚師 | 查看廚房看板、更新製作狀態、查看缺料提醒、回報訂單問題。 |
| `owner` | 老闆 | 管理菜單、套餐、分類、優惠券、庫存、缺料影響與營運分析。 |
| `admin` | 管理者 | 擁有完整後台權限，可審核身份申請與調整使用者權限。 |

---

## 4. 操作流程導覽

這一段提供給老師、助教或測試者快速驗收系統使用。

### 4.1 顧客 / 訪客點餐

1. 進入線上展示網站。
2. 瀏覽菜單與套餐組合。
3. 將餐點加入購物車。
4. 可選擇登入會員，或直接使用訪客身份填寫姓名與電話。
5. 選擇取餐方式、付款方式、取餐時間與備註。
6. 送出訂單。
7. 訪客可使用取餐編號與電話查詢訂單。

### 4.2 店員處理現場與電話訂單

1. 使用店員身份登入。
2. 進入「後台管理」。
3. 到「訂單處理」建立現場或電話訂單。
4. 填寫顧客姓名、電話、餐點、付款方式與備註。
5. 協助更新付款狀態、取消訂單或標記問題訂單。

### 4.3 廚師使用廚房看板

1. 使用廚師身份登入。
2. 進入後台的「廚房看板」。
3. 查看待製作、製作中與餐點彙總。
4. 將訂單標記為「製作中」或「可取餐」。
5. 若餐點有缺料或特殊狀況，可標記訂單問題。

### 4.4 老闆管理營運

1. 使用老闆身份登入。
2. 在後台管理菜單、分類、套餐與優惠券。
3. 查看營運分析，例如營收、熱銷商品、訂單來源與優惠券成效。
4. 到「庫存管理」建立原料、設定安全庫存、綁定餐點原料。
5. 使用「缺料影響分析」查看哪些餐點因原料不足無法製作。
6. 執行「同步下架缺料商品」，避免顧客點到無法製作的餐點。

### 4.5 管理者處理權限

1. 使用管理者身份登入。
2. 進入「權限管理」。
3. 查看員工身份申請。
4. 核准或拒絕店員 / 廚師權限。
5. 查看操作紀錄，確認誰修改了訂單、菜單、庫存或權限。

---

## 5. 系統架構

本專案可從兩個角度理解：一個是老師課程中強調的 Contract-first 三層架構，另一個是實際部署時的 Web 系統三層架構。

### 5.1 05-1 Contract-first 三層架構

本專案延續 05-1 講義中的三層架構概念，以 `contracts → route-schemas → backend` 作為主要開發順序。這種做法可以避免前後端各寫各的，也可以讓 API 輸入、輸出與權限規則更清楚。

| 層級 | 對應檔案 | 在本專案中的作用 |
|---|---|---|
| 第 1 層：業務資料事實 | `shared/contracts.ts` | 定義系統中穩定存在的資料，例如餐點、訂單、角色、優惠券、原料、操作紀錄等。 |
| 第 2 層：API 操作規格 | `shared/route-schemas.ts` | 定義每個 API 的請求參數、body、response envelope 與驗證規則。認證與授權也屬於 API 操作規格的一部分。 |
| 第 3 層：後端實作與資料儲存 | `backend.ts`, `store/*`, `db/schema.ts` | 由 Elysia route 實作 API，呼叫 Store 操作資料，並透過 Drizzle / Neon PostgreSQL 儲存資料。 |

### 5.2 實際部署三層架構

| 層級 | 技術 | 說明 |
|---|---|---|
| 前端介面層 | React、Vite、Tailwind、DaisyUI | 顧客點餐、購物車、後台管理、廚房看板、營運分析與庫存管理。 |
| 後端服務層 | Bun、Elysia、Better Auth | 提供 REST API、登入驗證、RBAC 權限檢查、訂單流程、優惠券計算與庫存同步。 |
| 資料儲存層 | Neon PostgreSQL、Drizzle ORM、JSON fallback | 保存使用者、訂單、菜單、分類、套餐、優惠券、庫存與操作紀錄。 |

---

## 6. 已完成的主要功能

### 6.1 顧客端

- 會員顧客可登入後點餐。
- 訪客可免登入點餐，只需留下姓名與電話。
- 顧客可查詢歷史訂單、再次訂購與查看常點品項。
- 可查看目前廚房排隊數、預估等待時間與忙碌程度。
- 支援套餐加入購物車與優惠碼套用。

### 6.2 店員端

- 可建立現場訂單與電話訂單。
- 可協助顧客處理付款、取消訂單與訂單問題。
- 可查看訂單列表與訂單狀態。
- 可協助調整基本庫存。

### 6.3 廚房端

- 廚房看板顯示待製作與製作中的訂單。
- 可更新訂單狀態，例如製作中、可取餐、已完成。
- 可查看餐點彙總，方便一次整理同類餐點。
- 可看到團體訂單中的成員名稱與特殊備註。

### 6.4 老闆端

- 菜單、分類、套餐管理。
- 優惠券建立、修改、停用與成效分析。
- 營運分析：營收、熱銷商品、訂單來源、價格敏感度、A/B 測試。
- 庫存管理：原料、配方、缺料影響與缺料商品同步下架。
- 操作紀錄：查看重要後台操作。

### 6.5 管理者端

- 審核店員與廚師身份申請。
- 調整使用者角色。
- 查看完整操作紀錄。
- 擁有完整後台管理權限。

---

## 7. 功能與 API 對應

| 功能 | 主要 API | 用途 |
|---|---|---|
| 使用者與權限 | `GET /api/me`, `POST /api/users/me/role-request`, `GET /api/admin/role-requests`, `PATCH /api/admin/users/:userId/roles` | 取得登入者、申請身份、審核身份與調整角色。 |
| 菜單 | `GET /api/menu`, `POST /api/menu`, `PATCH /api/menu/:id`, `DELETE /api/menu/:id`, `GET /api/menu/:id/history` | 查詢、建立、修改、刪除餐點與查看菜單版本紀錄。 |
| 分類 | `GET /api/categories`, `POST /api/categories`, `PATCH /api/categories/:id`, `DELETE /api/categories/:id` | 管理菜單分類。 |
| 訂單 | `GET /api/orders`, `POST /api/orders`, `PATCH /api/orders/:id`, `POST /api/orders/:id/submit`, `PATCH /api/orders/:id/status` | 建立購物車、送出訂單、更新品項與訂單狀態。 |
| 訪客訂單 | `POST /api/orders/guest`, `POST /api/orders/guest/lookup` | 訪客建立訂單與查詢訂單。 |
| 現場 / 電話訂單 | `POST /api/orders/walk-in` | 店員建立現場或電話訂單。 |
| 套餐 | `GET /api/menu-bundles`, `GET /api/admin/menu-bundles`, `POST /api/admin/menu-bundles`, `PATCH /api/admin/menu-bundles/:id` | 顧客查看套餐，老闆與管理者維護套餐。 |
| 優惠券 | `GET /api/admin/promotions`, `POST /api/admin/promotions`, `PATCH /api/admin/promotions/:id`, `DELETE /api/admin/promotions/:id` | 建立、修改、停用與查詢優惠券。 |
| 營運分析 | `GET /api/admin/analytics/summary`, `GET /api/admin/analytics/top-items`, `GET /api/admin/analytics/insights`, `GET /api/admin/analytics/price-sensitivity`, `GET /api/admin/analytics/ab-tests` | 查看營收、熱銷商品、洞察、價格敏感度與 A/B 測試結果。 |
| 庫存 | `GET /api/ingredients`, `POST /api/ingredients`, `PATCH /api/ingredients/:id/stock`, `GET /api/inventory/impacts`, `POST /api/inventory/sync-menu-availability` | 原料管理、缺料影響與缺料同步下架。 |
| 操作紀錄 | `GET /api/admin/audit-logs` | 查詢重要後台操作紀錄。 |

---

## 8. 主要資料表

| 模組 | 資料表 | 說明 |
|---|---|---|
| 使用者與權限 | `user`, `session`, `account`, `verification`, `role_requests` | Better Auth 使用者資料、登入 session、OAuth 帳號與角色申請。 |
| 菜單與分類 | `menu_items`, `categories`, `menu_item_categories` | 餐點、分類與餐點分類關聯。 |
| 訂單 | `orders`, `order_items` | 訂單主檔與訂單明細，包含訂購當下的餐點快照。 |
| 套餐 | `menu_bundles`, `menu_bundle_items` | 套餐主檔與套餐內餐點組成。 |
| 優惠券 | `promotions` | 折扣碼、折扣類型、最低消費、有效期間與使用上限。 |
| 庫存 | `ingredients`, `menu_item_ingredients` | 原料庫存與餐點所需原料設定。 |
| 操作紀錄 | `audit_logs` | 後台重要操作記錄，例如修改菜單、取消訂單、調整庫存。 |

---

## 9. 本機啟動方式

### 9.1 安裝套件

```bash
bun install
```

### 9.2 啟動前後端

```bash
bun run dev
```

此指令會同時啟動前端 Vite 與後端 Elysia。

也可以分開啟動：

```bash
bun run dev:frontend
bun run dev:backend
```

### 9.3 建置專案

```bash
bun run build
```

### 9.4 執行測試

```bash
bun test
```

---

## 10. 常用指令

| 指令 | 說明 |
|---|---|
| `bun run dev` | 同時啟動前端與後端開發模式。 |
| `bun run dev:frontend` | 只啟動前端開發伺服器。 |
| `bun run dev:backend` | 只啟動後端開發伺服器。 |
| `bun run build` | 建置前端與後端。 |
| `bun test` | 執行測試。 |
| `bun run start` | 啟動 build 後的後端。 |
| `bun run db:studio` | 開啟 Drizzle Studio。 |

---

## 11. 環境變數

部署或本機連線資料庫時，需要依環境設定下列變數。請勿把真實 secret commit 到 GitHub。

```env
PORT=3000
HOST=0.0.0.0
API_ALLOWED_ORIGIN=
DATABASE_URL=
DATABASE_URL_MIGRATION=
STORE_DRIVER=postgres
PG_SCHEMA=bf_v10
BETTER_AUTH_URL=
BETTER_AUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
DEMO_AUTH_ENABLED=true
VITE_API_BASE_URL=
```

注意事項：

- `PG_SCHEMA` 本專案使用 `bf_v10`，不建議使用 `public`。
- `STORE_DRIVER=postgres` 時使用 Neon PostgreSQL；未使用 PostgreSQL 時可使用 JSON fallback store。
- `BETTER_AUTH_SECRET` 必須設定為安全字串，不能使用範例值。
- Google OAuth callback 需要與部署網址一致。

---

## 12. SQL 文件位置

資料庫補充 SQL 放在 `docs/sql/`，每個檔案對應一個功能階段：

| SQL 檔案 | 用途 |
|---|---|
| `v10_1_menu_versioning.sql` | 菜單版本化與訂單明細版本快照。 |
| `v10_3_ab_testing.sql` | A/B 測試分組。 |
| `v10_3_promotions.sql` | 優惠券。 |
| `v10_3_phone_orders.sql` | 電話訂單。 |
| `v10_3_guest_checkout.sql` | 訪客訂餐。 |
| `v10_3_group_bundle_order.sql` | 團體訂餐與套餐。 |
| `v10_3_inventory_shortage.sql` | 原料庫存與缺料影響。 |

---

## 13. 測試檔案

| 測試檔案 | 測試重點 |
|---|---|
| `tests/menu-versioning.test.ts` | 菜單版本化、版本紀錄與版本驗證。 |
| `tests/ab-testing.test.ts` | A/B 分組與菜單過濾。 |
| `tests/promotion-discount.test.ts` | 優惠券折扣規則。 |
| `tests/guest-checkout.test.ts` | 訪客訂餐與訪客訂單查詢。 |
| `tests/phone-orders.test.ts` | 電話訂單。 |
| `tests/group-bundle-order.test.ts` | 團體訂餐、套餐 schema 與套餐計價。 |
| `tests/inventory-shortage.test.ts` | 庫存狀態、缺料影響與缺料同步下架。 |
| `tests/audit-log.test.ts` | 操作紀錄資料格式。 |

---

## 14. Render 部署說明

建議 Render 設定：

| 項目 | 設定 |
|---|---|
| Build Command | `bun install && bun run build` |
| Start Command | `bun run start` |
| HOST | `0.0.0.0` |
| Database | Neon PostgreSQL |

Google OAuth callback 需要加入正式部署網址，例如：

```text
https://u1324026-bf1042.onrender.com/api/auth/callback/google
```

---

## 15. 驗收建議流程

建議驗收時依照以下順序展示，可以完整看出前台、後台與資料流程：

1. 以訪客身份點餐，送出訂單。
2. 使用訪客取餐編號與電話查詢訂單。
3. 使用店員身份建立現場或電話訂單。
4. 使用廚師身份進入廚房看板，更新訂單狀態。
5. 使用老闆身份管理菜單、套餐、優惠券與庫存。
6. 建立原料並綁定餐點，測試缺料影響分析。
7. 執行缺料商品同步下架。
8. 使用管理者身份查看操作紀錄與審核身份申請。

---

## 16. 未來可延伸功能

以下功能尚未完整實作，可作為後續擴充方向：

| 未來功能 | 延伸價值 |
|---|---|
| 成本與毛利分析 | 由原料成本推算餐點毛利，協助老闆調整價格。 |
| 自動扣庫存 | 訂單完成後依照餐點配方自動扣除原料數量。 |
| 進貨與補貨建議 | 根據安全庫存與銷售速度提醒補貨。 |
| 會員集點 | 提高熟客回訪率。 |
| 營業時間與公休日設定 | 控制可下單時段，避免非營業時間接單。 |
| 報表匯出 | 將營收、訂單、操作紀錄匯出為 CSV 或 Excel。 |
| QR Code 桌邊點餐 | 顧客掃 QR Code 建立內用訂單。 |
| 多分店管理 | 支援不同分店各自管理菜單、庫存與訂單。 |
| AI 銷售預測 | 根據歷史訂單與時段預測備料需求。 |
| Line / 簡訊通知 | 訂單可取餐時自動通知顧客。 |
