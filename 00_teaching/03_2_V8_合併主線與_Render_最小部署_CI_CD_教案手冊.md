# V8 合併主線與 Render 最小部署 CI/CD 教案手冊

本手冊給課堂直接使用，目標是讓從「功能分支完成」走到「主線可部署」，並建立標準 release 流程。

教學原則固定如下：

- 先講為什麼（背後邏輯與理論）
- 再講要做什麼（產出與驗收標準）
- 最後才講怎麼做（實際指令）

---

## 0. 教學目標與完成定義

### 為什麼

常把「本機可跑」誤認為「可上線」。真實開發需要主線治理、審查與可回滾能力。

### 要做什麼

在 V8 完成後，依序完成：

1. 分支驗證（品質閘門）
2. PR 與 PM/PO 確認
3. 合併回 main
4. 用 main 觸發 Render 最小可用部署
5. 建立最小 CI/CD

### 完成標準

- `main` 可成功 build 並部署
- 雲端健康檢查端點成功回應
- 至少一支核心 API 在雲端可用
- PR 有技術審查與 PM/PO 核可紀錄

---

## 1. 流程觀念：為什麼 main 要是唯一部署來源

### 為什麼

- `main` 代表團隊共同真相（single source of truth）
- 可回滾、可追蹤、可審計
- 避免「線上版本其實來自某個 feature branch」

### 要做什麼

建立規範：正式環境只從 `main` 部署，功能分支只能做開發與驗證。

### 怎麼做

把以下規範寫進課堂共識：

1. 功能開發在 `feature/*`
2. 驗證與審查在 PR
3. 只有 merge 後的 `main` 才能部署 production

---

## 2. V8 分支驗證（合併前）

### 為什麼

如果在合併後才發現壞掉，主線會不穩，部署風險與修復成本都更高。

### 要做什麼

在 `feature/v8` 先完成最低品質閘門：

- 安裝依賴
- 型別/語法與測試檢查
- build 成功

### 怎麼做

```bash
git checkout feature/v8
bun install
bun run build
```

若專案已有對應腳本，再加上：

```bash
bun run lint
bun run test
```

---

## 3. 建立 PR 並加入 PM/PO 確認

### 為什麼

技術上能過不代表商業上可上線。教學應讓理解「技術審查 + 業務核可」是兩條平行必要條件。

### 要做什麼

建立 `feature/v8 -> main` 的 PR，並在合併前同時滿足：

1. 技術 Reviewer 同意
2. PM/PO 確認可上線

### 怎麼做

在 PR 描述中要求固定欄位：

```md
## 變更摘要

-

## 風險與影響面

-

## 驗證證據

- build:
- API 測試:

## 上線前確認

- [ ] Reviewer approve
- [ ] PM/PO approve
```

---

## 4. 合併回 main（release discipline）

### 為什麼

主線合併是「版本交付」動作，不是單純把程式碼湊在一起。這一步決定是否能穩定部署。

### 要做什麼

合併策略建議使用 squash merge（教學中最容易對照版本變更）。

### 怎麼做

```bash
git checkout main
git pull origin main
git merge --squash feature/v8
git commit -m "feat: merge V8 to main for deployment baseline"
git push origin main
```

可選但建議：在 main 打版本標籤。

```bash
git tag -a v8.0.0 -m "V8 baseline before V9"
git push origin v8.0.0
```

---

## 5. Render 最小可用部署（先求可用，再求完整）

### 為什麼

課堂第一階段部署先達到最小可運作成果，避免一次塞入太多維運細節。Render 原生支援 Bun，**不需要 Docker**，設定更少、除錯更直覺。

### 要做什麼

依序完成以下四項：

1. 在 Render 建立 Web Service，連結 GitHub repo
2. 設定 **Bun** 環境與正確的 Build / Start 指令
3. 設定 Neon `DATABASE_URL` 等環境變數
4. 部署成功並驗證健康檢查與核心 API

### 怎麼做

---

#### 步驟 1：建立帳號並連結 repo

1. 前往 <https://render.com> → 點擊 **Sign Up**，以 GitHub 帳號登入
2. 儀表板 → **New +** → **Web Service**
3. 選擇 **GitHub**，授權後選取你的 repo

---

#### 步驟 2：設定服務基本資訊

| 欄位          | 值                                                   |
| ------------- | ---------------------------------------------------- |
| Name          | `breakfast-api`（可自訂）                            |
| Region        | `Singapore`（距台灣較近）                            |
| Branch        | `main`                                               |
| Environment   | **Bun**（不選 Node / Docker）                        |
| Build Command | `bun install && bun run db:migrate && bun run build` |
| Start Command | `bun start`                                          |
| Plan          | Free                                                 |

> **為什麼 Build Command 這樣寫？**
>
> - `bun install`：下載依賴
> - `bun run db:migrate`：執行 `drizzle-kit migrate`，把 `drizzle/` 資料夾中的 SQL 套用到 Neon（在程式碼上線前先確保 schema 正確）
> - `bun run build`：同時 build 前端（Vite → `public/`）與後端（Bun bundler → `dist/backend.js`）

---

#### 步驟 3：設定環境變數

在 **Environment → Add Environment Variable** 逐一加入：

| Key                  | 說明                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`       | Neon 連線 URL，格式：`postgresql://user:pass@ep-xxx.region.aws.neon.tech/dbname?sslmode=require` |
| `NODE_ENV`           | `production`                                                                                     |
| `API_ALLOWED_ORIGIN` | 前端網址（部署後 Render 提供），初期可先填 `*`                                                   |

> **`DATABASE_URL_MIGRATION` 是什麼？**
>
> 本專案的 `drizzle.config.ts` 設計如下：
>
> ```ts
> const migrationUrl =
>   process.env.DATABASE_URL_MIGRATION ?? process.env.DATABASE_URL;
> ```
>
> 如果 migration 用的連線（通常是 Neon **direct connection**）與 runtime 用的連線（Neon **connection pooler**）不同，就另外設定 `DATABASE_URL_MIGRATION`；若相同則只設 `DATABASE_URL` 即可。
>
> Neon 免費帳號的 Direct Connection 與 Pooler URL 可在 Neon Dashboard → Connection Details 各別複製。

---

#### 步驟 4：建立 Web Service 並等待首次部署

點擊 **Create Web Service**，Render 會依序執行：

```
1. bun install
2. drizzle-kit migrate   ← 套用 drizzle/ SQL 到 Neon
3. bun run build         ← 產生 dist/backend.js
4. bun start             ← 啟動 dist/backend.js，監聽 process.env.PORT
```

---

#### 步驟 5：部署後立即驗證

```bash
# 健康檢查
curl -i https://<your-render-domain>.onrender.com/health
# 預期：{"status":"ok"}

# 核心 API
curl -i https://<your-render-domain>.onrender.com/api/menu
```

---

#### 常見問題排查

| 症狀                           | 可能原因                                                        | 解法                                                                                 |
| ------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `DATABASE_URL is not set`      | 環境變數未設定                                                  | 補上 `DATABASE_URL`                                                                  |
| `drizzle-kit migrate` 失敗     | Neon URL 格式錯誤，或 SSL 未啟用                                | 確認 URL 包含 `?sslmode=require`                                                     |
| Build 成功但啟動失敗           | `PORT` 未由 Render 傳入                                         | 確認 `backend.ts` 讀取 `process.env.PORT`                                            |
| 首次請求很慢（~30 秒）         | Free plan 閒置後會 spin down                                    | 預期行為，正式環境需付費計劃                                                         |
| 前端資源 404                   | `public/` 未正確 serve                                          | 確認 `@elysiajs/static` plugin 已掛載，且 build 有產生 `public/`                     |
| 加入購物車失敗但重新登入後正常 | 瀏覽器 `localStorage` 保留舊 `userId`，目前資料源查不到該使用者 | 先登出再登入；前端在 `/api/orders` 收到 `401/403/404` 時應清理登入狀態並提示重新登入 |

---

## 6. 為什麼這時候要教 CI/CD（而且只教最小版）

### 為什麼

剛完成「分支 -> 主線 -> 部署」閉環，最適合立刻補上自動化檢查，建立工程習慣。

### 要做什麼

先做最小 CI/CD：

1. PR 觸發：build（可選 lint/test）
2. merge 到 main 後：由 Render 自動部署
3. 部署後：人工驗證健康檢查與核心 API

### 怎麼做

建立 GitHub Actions 檔案 `.github/workflows/ci.yml`：

```yaml
name: ci

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install
      - run: bun run build
```

---

## 7. 課堂時間建議（90 分鐘）

1. 0-15 分：主線治理觀念（為什麼 main 是唯一部署來源）
2. 15-30 分：V8 分支驗證
3. 30-50 分：PR、Reviewer、PM/PO 核可
4. 50-65 分：merge 回 main + tag
5. 65-80 分：Render 部署與雲端驗證
6. 80-90 分：建立最小 CI 並回顧

---

## 8. 教學重點句（可直接口頭使用）

1. 功能完成不等於可上線，合併治理才是上線起點。
2. 正式環境只看 main，feature branch 不直接進 production。
3. 合併前要有兩種確認：技術可行與業務可上線。
4. 先做最小部署，再逐步補齊完整維運能力。

---

## 9. 下一步銜接

完成本手冊後，再進入 V9：`Better Auth + Google provider`。這樣會先有穩定主線與部署基礎，再理解正式 auth 架構的價值。

---

## 10. 課堂配套附件（建議同時使用）

### 為什麼

若只有流程手冊，仍可能不知道「PR 要寫到什麼程度」與「助教如何評分」。

### 要做什麼

搭配以下兩份附件一起執行：

1. `03_3_GitHub_PR_模板與審查清單.md`
2. `03_4_V8_合併與部署_課堂評分Rubric.md`

### 怎麼做

1. 發 PR 時，直接套用 PR 模板欄位
2. Demo 與驗收時，依 Rubric 五大面向提交證據
3. 小組回饋時，以 Rubric 的扣分點做下一輪改進清單
