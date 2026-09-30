# DCA Portfolio Tracker — Vercel Port

Vercel-ready port ของเว็บแอป DCA Portfolio Tracker (ย้ายมาจาก Hatch artifact):
ติดตามแผน DCA รายเดือนในหุ้น 7 ตัว (NVDA, AAPL, MSFT, TSLA, META, AMZN, GOOGL) —
บันทึกการซื้อ, ติดตามราคา, คำนวณผลตอบแทนจริงเทียบแผน, คาดการณ์เป้าหมาย
และคำแนะนำ rebalance

## Stack

- **Frontend:** React 19 SPA (Vite → `client/dist`), Tailwind CSS v4 + shadcn-style UI, TanStack Query, Recharts
- **Backend:** Vercel Serverless Function ไฟล์เดียว (`api/[action].ts`), drizzle-orm + `@libsql/client`
- **Database:** Turso (SQLite, remote)
- **ราคาหุ้น:** Finnhub REST API (`FINNHUB_API_KEY`)

## Layout

```
client/     React SPA (build → client/dist)
api/        Serverless function เดียว + handlers ใน api/_actions/
shared/     drizzle schema และสูตรจัดสระเงินที่ใช้ร่วมกัน
drizzle/    SQL migrations (0001–0004)
scripts/    seed-from-sqlite.mjs — ย้ายข้อมูลจริงจาก app.db → Turso
vercel.json ค่า deploy ของ Vercel
DEPLOY.md   คู่มือ deploy ทีละขั้นตอน (ภาษาไทย)
```

## API

ทุก action เป็น `POST /api/<action>` ด้วย JSON body เดียวกันหมด
ตัว route อยู่ที่ `api/handler.ts` (function ไฟล์เดียว) และ map กับ handler ใน
`api/_actions/` (ขีดนำหน้า `_` ทำให้ Vercel ไม่นับเป็น function แยก — เหลือ
function เดียวตัวเดียว ไม่ชนลิมิต 12 functions ของ Vercel Hobby)

`vercel.json` ทำ rewrite `/api/:action` → `/api/handler/:action` เพราะโฟลเดอร์
`/api` ของ Vercel map route จาก**ชื่อไฟล์** เท่านั้น — dynamic segment ในวงเล็บ
`[action].ts` เป็นฟีเจอร์ของ Next.js และจะ 404 ทุก request บนโปรเจกต์นี้

## Environment variables

| ตัวแปร | ใช้ทำอะไร |
|---|---|
| `TURSO_DATABASE_URL` | URL ฐานข้อมูล Turso (`libsql://...`) |
| `TURSO_AUTH_TOKEN` | Token เข้าถึง Turso (**ห้าม**ใส่ในโค้ด/CLI — ใช้ env var เท่านั้น) |
| `FINNHUB_API_KEY` | API key ของ Finnhub (ฟรี, 60 calls/นาที) |

## Features

- **บันทึกรายการซื้อ** — เพิ่ม / แก้ไข / ลบ (ยืนยันก่อนลบ) พร้อมคำนวณจำนวนหุ้นสด
- **บันทึกทั้งรอบ** — กดปุ่มเดียวบันทึกทุกหุ้นตามสัดส่วนเป้าหมายของรอบนั้น ปรับยอดเองได้
- **นำเข้า CSV** — วางข้อมูลจากโบรกเกอร์ ดูตัวอย่างรายแถวก่อนบันทึก ข้ามแถวที่ผิดพลาดโดยไม่ทิ้งทั้งชุด
- **สำรอง / กู้คืน** — ดาวน์โหลดเป็น JSON (กู้คืนได้) หรือ CSV (เปิดใน Excel ได้)
- **ประวัติผลงานจริง** — กราฟมูลค่าพอร์ตเทียบเงินที่ลงไป, ระยะถอยจากจุดสูงสุด,
  และ sparkline รายหุ้น
- **ผลตอบแทนจริง (XIRR)** — เทียบกับผลตอบแทนที่ตั้งไว้ในแผน
- **พรีเซ็ตน้ำหนัก** — เท่ากัน / ตามเทรนด์ 6 เดือน พร้อมหน้าตัวอย่างก่อนใช้จริง

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

