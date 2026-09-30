# คู่มือ Deploy — DCA Portfolio Tracker บน Vercel

สถาปัตยกรรม: React SPA (static) + Vercel Serverless Function เดียว (`api/[action].ts`)
+ ฐานข้อมูล Turso (SQLite) + ราคาหุ้นสดจาก Finnhub

คู่มือนี้มี 3 ส่วน:

- **ส่วนที่ 1** — รันบนเครื่องตัวเอง (local dev)
- **ส่วนที่ 2** — ขึ้น production บน Vercel
- **ส่วนที่ 3** — วิธีจัดการฐานข้อมูลแบบมาตรฐาน (Drizzle)

---

## ของที่ต้องเตรียม (ทำครั้งเดียว)

- Node.js 20+ และ Git
- บัญชี Turso (ฟรี) — https://turso.tech → สร้าง database เปล่า จดไว้ 2 ค่า:
  - **Database URL** — หน้าตาแบบ `libsql://<ชื่อ-db>-<บัญชี>.turso.io`
  - **Auth Token** — สร้าง token ใหม่สำหรับ DB นี้
- (ถ้าอยากกด "ดึงราคาล่าสุด") Finnhub API key ฟรี — https://finnhub.io
  (แผนฟรี 60 calls/นาที แอปนี้ดึง ~8 symbols ใช้ได้สบาย
  — ยกเว้น "ดึงราคาย้อนหลัง 1 ปี" ที่ใช้ endpoint เสียเงิน ดูหัวข้อ "เรื่องราคาย้อนหลัง")

> token/key เก็บไว้ในที่ปลอดภัย ใช้ผ่าน environment variable เท่านั้น
> ห้ามวางลงไฟล์ที่ commit ขึ้น repo

---

## ส่วนที่ 1 — รันบนเครื่องตัวเอง

```powershell
git clone https://github.com/zixsorus/dca-portfolio-tracker.git
cd dca-portfolio-tracker
npm install
```

สร้างไฟล์ `.env` ในโฟลเดอร์โปรเจกต์:

```
TURSO_DATABASE_URL=libsql://<ชื่อ-db>-<บัญชี>.turso.io
TURSO_AUTH_TOKEN=<token>
FINNHUB_API_KEY=<key>   # ถ้ามี
```

สร้างตาราง + ใส่ค่าเริ่มต้น (รันครั้งเดียวต่อ DB):

```powershell
$env:TURSO_DATABASE_URL="libsql://<ชื่อ-db>-<บัญชี>.turso.io"
$env:TURSO_AUTH_TOKEN="<token>"

npm run db:migrate
npm run db:seed -- --target "libsql://<ชื่อ-db>-<บัญชี>.turso.io"
```

แล้วรันแอพ:

```powershell
npm run dev
```

เปิด http://localhost:5173

**ค่าเริ่มต้นที่ `db:seed` ใส่ให้:**

- settings: DCA 2,000 บาท/เดือน, เป้าหมาย 100,000 บาท, ผลตอบแทนคาดหวัง 8%/ปี
- หุ้น 7 ตัว: NVDA 16%, AAPL / MSFT / TSLA / META / AMZN / GOOGL ตัวละ 14%
  (น้ำหนักรวม 100% พอดี)

**หมายเหตุ:**

- `.env` ถูก gitignore แล้ว ไม่หลุดขึ้น repo — ดูตัวอย่างค่าได้ที่ `.env.example`
- local dev ต่อ Turso ตัวเดียวกับ production — ข้อมูลที่แก้ใน local มีผลกับ
  ของจริงทันที ถ้าอยากทดลองแบบไม่กระทบ ให้สลับ `.env` เป็น
  `TURSO_DATABASE_URL=file:./local.db` ชั่วคราว (ไม่ต้องใช้ token,
  `npm run dev` จะสร้างไฟล์และ schema ให้อัตโนมัติ)
- `FINNHUB_API_KEY` จำเป็นเฉพาะตอนกด "ดึงราคาล่าสุด" ถ้าไม่ใส่ปุ่มจะ
  แจ้งเตือนตามปกติโดยไม่ล้างราคาเก่า

---

## ส่วนที่ 2 — ขึ้น production บน Vercel

### 2.1 Push โค้ดขึ้น GitHub

`git add -A` → commit → `git push` (ย้ำว่า `.gitignore` กันไฟล์ `*.db`
และ `.env*` ไว้แล้ว — ห้าม commit ฐานข้อมูลหรือ key ขึ้นไปเด็ดขาด)

### 2.2 Import โปรเจกต์ใน Vercel + ตั้งค่า Environment Variables

1. ที่ https://vercel.com → **Add New → Project** → เลือก repo
2. ตั้งค่า Environment Variables **3 ตัว** (Production + Preview + Development):
   - `TURSO_DATABASE_URL` = Database URL จากของที่ต้องเตรียม
   - `TURSO_AUTH_TOKEN` = Auth Token จากของที่ต้องเตรียม
   - `FINNHUB_API_KEY` = Finnhub API key จากของที่ต้องเตรียม
3. กด **Deploy** — รอบแรกแอปจะขึ้นมาพร้อมค่าเริ่มต้นจาก `db:seed`
   (ถ้ารัน seed ไว้แล้ว) หรือตารางเปล่า

### 2.3 (ทางเลือก) ย้ายข้อมูลพอร์ตจริงจาก app.db เข้า Turso

ถ้ามีไฟล์ `app.db` เก่าที่อยากย้ายข้อมูลจริง (settings / หุ้น / ธุรกรรม)
เข้า Turso ให้รันครั้งเดียวจากโฟลเดอร์โปรเจกต์:

```powershell
$env:TURSO_AUTH_TOKEN="<token>"   # token ใส่ผ่าน env var เท่านั้น ห้ามเป็น argument
node scripts/seed-from-sqlite.mjs `
  --source "C:\path\to\app.db" `
  --target "libsql://<ชื่อ-db>-<บัญชี>.turso.io"
```

สคริปต์จะรัน migration ให้ก่อน (ถ้ายังไม่มีตาราง) แล้วคัดลอกทุกตารางจาก
`app.db` (เปิดแบบ read-only ไม่เขียนทับไฟล์ต้นฉบับ) พร้อมพิมพ์จำนวนแถว
ที่คัดลอกได้ต่อตาราง — รันซ้ำได้ ข้อมูลจะถูกแทนที่ด้วยข้อมูลในไฟล์
ต้นฉบับรอบล่าสุด

---

## ส่วนที่ 3 — จัดการฐานข้อมูล (มาตรฐาน Drizzle)

schema ถูกนิยามที่ `shared/schema.ts` ไฟล์ migration อยู่ที่ `drizzle/`
(ห้ามแก้ไฟล์ migration ที่รันไปแล้ว — สร้างไฟล์ใหม่แทน)

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run db:generate` | สร้างไฟล์ migration ใหม่จาก `shared/schema.ts` หลังแก้ schema |
| `npm run db:migrate` | รัน migration กับ DB เป้าหมาย (อ่าน `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` จาก env) |
| `npm run db:seed -- --target <url>` | ใส่ค่าเริ่มต้น (settings + หุ้น 7 ตัว) — idempotent รันซ้ำไม่สร้างข้อมูลซ้ำ |
| `npm run db:studio` | เปิด Drizzle Studio ดู/แก้ข้อมูลใน DB ผ่านเบราว์เซอร์ |

> `drizzle/meta/` ไม่มี snapshot JSON — `db:generate` จึง diff ไม่ออก
> ให้เขียนไฟล์ `.sql` เองแล้วเพิ่ม entry ใน `drizzle/meta/_journal.json`
> (ดู `0004_price_history.sql` เป็นตัวอย่าง)

### Migration สำหรับฐานข้อมูลที่ใช้อยู่แล้ว

DB ที่ deploy ไปแล้วต้องรัน `npm run db:migrate` เพื่อเพิ่มตาราง `price_history`
(ตารางเดียว, ประมาณ 2,000 แถวต่อปีต่อหุ้น 7 ตัว — เล็กมาก) ก่อนกด "ดึงราคาล่าสุด"
เพราะ action นั้นบันทึกราคาปิดวันนั้นลงตารางนี้ทุกครั้ง

> **ระวัง:** `.env` ของเครื่อง dev ชี้ไปที่ Turso ตัวเดียวกับ production
> `db:migrate` จึงกระทบข้อมูลจริงทันที — ตรวจ `TURSO_DATABASE_URL`
> ก่อนรันทุกครั้ง

---

## เรื่องราคาย้อนหลัง (สำคัญ)

กราฟย้อนหลังใช้ตาราง `price_history` ซึ่งมีข้อมูลสองทาง:

1. **บันทึกอัตโนมัติ (ใช้ได้เสมอ)** — ทุกครั้งที่กด "ดึงราคาล่าสุด"
   ระบบเก็บราคาปิดวันนั้นลง `price_history` โดยไม่กินโควตา Finnhub เพิ่ม
2. **ดึงย้อนหลัน 1 ปี (ปุ่ม "ดึงราคาย้อนหลัง 1 ปี")** — เรียก
   `Finnhub /stock/candle` ซึ่ง **เป็น endpoint เสียเงิน** แผนฟรีตอบว่า
   `You don't have access to this resource.` ปุ่มนี้จึงแจ้งว่าดึงไม่สำเร็จ
   และไม่กระทบข้อมูลเดิม

ผลคือ: ผู้ใช้ที่เพิ่งเริ่มจะเห็นกราฟย้อนหลังเติบโตทีละวันตามที่กดดึงราคา
ไม่ใช่ย้อนหลังทันที — ถ้าต้องการประวัติทันทีต้องมีแหล่งราคาอื่น

---

## Troubleshooting

| อาการ | วิธีแก้ |
|---|---|
| `TURSO_AUTH_TOKEN env var is required` | ลืมตั้ง `$env:TURSO_AUTH_TOKEN="..."` ใน PowerShell ก่อนรัน (อย่าใส่ token เป็น argument) |
| `drizzle-kit migrate` บอกตารางมีอยู่แล้ว | DB นี้รัน migration ไปแล้ว ข้ามไป `db:seed` ได้เลย |
| เปิดแอพแล้วขึ้น "เปิดข้อมูลไม่สำเร็จ" | ตาราง `settings` ว่าง — รัน `npm run db:seed` หนึ่งรอบแล้ว refresh |
| `no such table: price_history` | รัน `npm run db:migrate` (DB production เดิมยังไม่มีตารางนี้) |
| API บน Vercel ตอบ 500 / เชื่อม DB ไม่ได้ | ตรวจ env vars ทั้ง 3 ตัวใน Vercel → Settings → Environment Variables แล้ว redeploy |
| เรียก `/api/xxx` แล้วได้ 404 "ไม่พบ action" | ชื่อ action ไม่ตรงกับ key ใน `shared/actions.ts` — ต้อง POST เป็น JSON |
| ราคาไม่อัปเดต / Finnhub error | ตรวจ `FINNHUB_API_KEY` และดูว่าเกิน 60 calls/นาทีหรือไม่ (8 symbols ปกติไม่เกิน) |
| "ดึงราคาย้อนหลังไม่สำเร็จ" | `/stock/candle` เป็น endpoint เสียเงินของ Finnhub — เป็นข้อจำกัดของแผนฟรี ไม่ใช่บั๊ก |
| อยากทดสอบโดยไม่แตะ Turso | ใช้ `--target file:./local.db` (หรือ `/tmp/xxx.db`) กับ `db:seed` / `seed-from-sqlite.mjs` |

## Cheat sheet (PowerShell, รันในโฟลเดอร์โปรเจกต์)

```powershell
# ตั้ง env (ครั้งเดียวต่อ session)
$env:TURSO_DATABASE_URL="libsql://<ชื่อ-db>-<บัญชี>.turso.io"
$env:TURSO_AUTH_TOKEN="<token>"

# ตั้ง DB ใหม่หมด
npm run db:migrate
npm run db:seed -- --target $env:TURSO_DATABASE_URL

# รันแอพ
npm run dev
```
