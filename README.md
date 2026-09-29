# DCA Portfolio Tracker — Vercel Port

Vercel-ready port ของเว็บแอป DCA Portfolio Tracker (ย้ายมาจาก Hatch artifact):
ติดตามแผน DCA รายเดือนในหุ้น "Magnificent 7" (+ AMD) — บันทึกการซื้อ,
ติดตามราคา, คาดการณ์เป้าหมาย และคำแนะนำ rebalance

## Stack

- **Frontend:** React 19 SPA (Vite → `client/dist`), Tailwind CSS v4 + shadcn-style UI, TanStack Query, Recharts
- **Backend:** Vercel Serverless Functions (`api/`, Node runtime), drizzle-orm + `@libsql/client`
- **Database:** Turso (SQLite, remote)
- **ราคาหุ้น:** Finnhub REST API (`FINNHUB_API_KEY`)

## Layout

```
client/     React SPA (build → client/dist)
api/        Vercel serverless functions
shared/     drizzle schema ที่ใช้ร่วมกัน
drizzle/    SQL migrations (0001–0003)
scripts/    seed-from-sqlite.mjs — ย้ายข้อมูลจริงจาก app.db → Turso
vercel.json ค่า deploy ของ Vercel
DEPLOY.md   คู่มือ deploy ทีละขั้นตอน (ภาษาไทย)
```

## Environment variables

| ตัวแปร | ใช้ทำอะไร |
|---|---|
| `TURSO_DATABASE_URL` | URL ฐานข้อมูล Turso (`libsql://...`) |
| `TURSO_AUTH_TOKEN` | Token เข้าถึง Turso (**ห้าม**ใส่ในโค้ด/CLI — ใช้ env var เท่านั้น) |
| `FINNHUB_API_KEY` | API key ของ Finnhub (ฟรี, 60 calls/นาที) |

## Scripts

```bash
npm run build      # build client → client/dist (Vercel ใช้คำสั่งนี้)
npm run typecheck  # ตรวจ type ทั้ง client และ api
npm run seed       # รันสคริปต์ย้ายข้อมูล (ต้องใส่ --source/--target เอง)
```

ย้ายข้อมูลจริงครั้งเดียว (ดูรายละเอียดใน `DEPLOY.md`):

```bash
export TURSO_AUTH_TOKEN="<your-token>"
node scripts/seed-from-sqlite.mjs \
  --source ~/workspace/ts-spaces/dca-portfolio-tracker/app.db \
  --target "libsql://<your-db>.turso.io"
```

## ความปลอดภัย

- `app.db*`, `*.db`, `.env*` ถูก gitignore — ห้าม commit ฐานข้อมูลจริงหรือ key ใดๆ
- ราคาเป็นข้อมูลเพื่อการติดตาม/การศึกษา ไม่ใช่คำแนะนำการลงทุน
