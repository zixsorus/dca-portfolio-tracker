# คู่มือ Deploy — DCA Portfolio Tracker บน Vercel

คู่มือนี้พาคุณย้ายแอป DCA Portfolio Tracker จาก Hatch ขึ้น Vercel พร้อมฐานข้อมูล
จริงของเต้ย (ตั้งใจให้ทำทีละขั้นตอน ใช้เวลาประมาณ 20–30 นาที)

สถาปัตยกรรม: React SPA (static) + Vercel Serverless Functions (`api/`) +
ฐานข้อมูล Turso (SQLite) + ราคาหุ้นสดจาก Finnhub

---

## รันบนเครื่องตัวเอง (local dev)

```bash
npm install
cp .env.example .env   # แก้ค่าใน .env ถ้าต้องการ (ดูคำอธิบายในไฟล์)
npm run dev
```

แล้วเปิด http://localhost:5173

- ครั้งแรก `npm run dev` จะสร้าง `./local.db` และย้ายข้อมูลพอร์ตจาก `app.db`
  เดิมให้อัตโนมัติ (อ่านอย่างเดียว ไม่แก้ไขไฟล์ต้นฉบับ)
- ไฟล์ `.env` ถูก gitignore ไว้แล้ว ไม่หลุดขึ้น repo — ตัวอย่างค่าดูที่
  `.env.example`
- `FINNHUB_API_KEY` จำเป็นเฉพาะตอนกด "ดึงราคาล่าสุด" ถ้าไม่ใส่ปุ่มนั้นจะ
  แจ้งเตือนตามปกติโดยไม่ล้างราคาเก่า

---

## ขั้นที่ 1 — สร้างฐานข้อมูลบน Turso

1. สมัคร/ล็อกอินที่ https://turso.tech (มี free tier)
2. สร้างฐานข้อมูลเปล่า เช่น ชื่อ `dca-portfolio` (แผนฟรีเพียงพอ)
3. จดค่า 2 อย่างนี้ไว้ (ต้องใช้ในขั้นที่ 4 และ 5):
   - **Database URL** — หน้าตาแบบ `libsql://<ชื่อ-db>-<บัญชี>.turso.io`
   - **Auth Token** — สร้าง token ใหม่สำหรับ DB นี้

> เก็บ token ไว้ในที่ปลอดภัย ห้ามวางลงไฟล์/โค้ดเด็ดขาด — token จะถูกใช้ผ่าน
> environment variable เท่านั้น

## ขั้นที่ 2 — ขอ Finnhub API Key (ฟรี)

1. สมัครที่ https://finnhub.io → ได้ API key ฟรี
2. แผนฟรีจำกัด **60 calls/นาที** — แอปนี้ดึงราคาแค่ ~8 ตัว (8 symbols)
   เลยใช้ได้สบาย ไม่เกิน limit

## ขั้นที่ 3 — Push โค้ดขึ้น GitHub

1. สร้าง repo ใหม่บน GitHub (เลือก **Private** เพื่อความปลอดภัย)
2. push โค้ดจากโฟลเดอร์นี้ขึ้นไป
   (ยืนยันว่า `.gitignore` กันไฟล์ `app.db*`, `*.db`, `.env*` ไว้แล้ว —
   ห้าม commit ฐานข้อมูลจริงหรือ API key ขึ้นไปเด็ดขาด)

## ขั้นที่ 4 — Import โปรเจกต์ใน Vercel + ตั้งค่า Environment Variables

1. ที่ https://vercel.com → **Add New → Project** → เลือก repo จากขั้นที่ 3
2. ตั้งค่า Environment Variables **3 ตัว** (Production + Preview + Development):
   - `TURSO_DATABASE_URL` = Database URL จากขั้นที่ 1
   - `TURSO_AUTH_TOKEN` = Auth Token จากขั้นที่ 1
   - `FINNHUB_API_KEY` = Finnhub API key จากขั้นที่ 2
3. กด **Deploy** — รอบแรกแอปจะขึ้นมาโดยยังไม่มีข้อมูลพอร์ต (ปกติ)

## ขั้นที่ 5 — ย้ายข้อมูลพอร์ตจริงจาก app.db เข้า Turso (รันครั้งเดียว)

รันจากเครื่องของคุณในโฟลเดอร์โปรเจกต์นี้ (ต้องมีไฟล์
`~/workspace/ts-spaces/dca-portfolio-tracker/app.db` อยู่):

```bash
export TURSO_AUTH_TOKEN="<token จากขั้นที่ 1>"   # ห้ามใส่ token ในคำสั่ง CLI ตรงๆ
node scripts/seed-from-sqlite.mjs \
  --source ~/workspace/ts-spaces/dca-portfolio-tracker/app.db \
  --target "libsql://<ชื่อ-db>-<บัญชี>.turso.io"
```

สคริปต์จะ:
1. รัน migration (`drizzle/*.sql`) บน Turso ตามลำดับไฟล์
2. ล้าง seed ตัวอย่างที่ migration ใส่มา (settings 1 แถว + หุ้น 7 ตัว)
   แล้วแทนที่ด้วยข้อมูลจริงของเต้ย (1 / 8 / 10 แถว)
3. คัดลอกทุกตารางจาก `app.db` (เปิดแบบ read-only ไม่มีการเขียนทับไฟล์จริง)
   แล้วพิมพ์จำนวนแถวที่คัดลอกได้ต่อตาราง

> สคริปต์เป็น idempotent แบบคร่าวๆ — รันซ้ำได้ ผลลัพธ์คือข้อมูลถูกแทนที่
> ด้วยข้อมูลจาก `app.db` ต้นทางรอบล่าสุด (เหมาะกับการซิงก์ซ้ำ)

## ขั้นที่ 6 — ทดสอบแอปที่ Deploy แล้ว

1. เปิด URL ของโปรเจกต์ใน Vercel
2. เช็กว่าตัวเลขตรงกับของเดิม: หุ้น 8 ตัว, ธุรกรรม 10 รายการ,
   ตั้งค่า DCA 2,000 บาท/เดือน, เป้าหมาย 100,000 บาท
3. ลองกดรีเฟรชราคา (Finnhub) แล้วดูว่าราคาปัจจุบันอัปเดต

---

## Troubleshooting

| อาการ | วิธีแก้ |
|---|---|
| Seed script บอก `TURSO_AUTH_TOKEN env var is required` | ลืม `export TURSO_AUTH_TOKEN=...` ก่อนรัน (อย่าใส่ token เป็น argument) |
| API บน Vercel ตอบ 500 / เชื่อม DB ไม่ได้ | ตรวจ env vars ทั้ง 3 ตัวใน Vercel → Settings → Environment Variables แล้ว redeploy |
| ราคาไม่อัปเดต / Finnhub error | ตรวจ `FINNHUB_API_KEY` และดูว่าเกิน 60 calls/นาทีหรือไม่ (8 symbols ปกติไม่เกิน) |
| ข้อมูลใน Turso ไม่ตรง/เก่า | รัน seed script ซ้ำอีกรอบ ข้อมูลจะถูกแทนที่ด้วย `app.db` ล่าสุด |
| อยากทดสอบสคริปต์โดยไม่แตะ Turso | ใช้ `--target file:/tmp/dca-seed-test.db` ทดสอบกับไฟล์ local ก่อน |

## สิ่งที่ต้องทำเอง (ทำแทนไม่ได้)

- สมัคร Turso / สร้าง DB / สร้าง token (ขั้นที่ 1)
- สมัคร Finnhub / คัดลอก API key (ขั้นที่ 2)
- สร้าง repo GitHub + push โค้ด (ขั้นที่ 3)
- เชื่อม Vercel กับ repo + ใส่ env vars 3 ตัว + กด Deploy (ขั้นที่ 4)
- รัน seed script ด้วย token ของตัวเอง (ขั้นที่ 5)
- เปิดแอปตรวจความถูกต้องของข้อมูล (ขั้นที่ 6)
