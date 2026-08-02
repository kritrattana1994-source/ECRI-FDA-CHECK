# 🚀 คู่มือการนำระบบขึ้น GitHub และ Deploy ไปยัง Vercel

ระบบนี้ถูกออกแบบตามสถาปัตยกรรม **Decoupled Modern Web App**:
- **Frontend (Web Application)**: พัฒนาด้วย React 18 + Vite + Tailwind CSS อยู่ในโฟลเดอร์ `frontend/` พร้อมสำหรับการนำขึ้น **Vercel**
- **Backend & Database**: ทำงานบน **Google Apps Script** + **Google Sheets Database** ผ่าน Universal API Router ใน `รหัส.js`

---

## 📌 ขั้นตอนที่ 1: Deploy Google Apps Script เพื่อรับ Web App URL (ทำครั้งเดียว)

1. เปิดโปรเจกต์ Google Apps Script (ไฟล์ `รหัส.js`)
2. คลิกปุ่มสีน้ำเงิน **Deploy (ทำให้ใช้งานได้)** ที่มุมขวาบน > เลือก **New deployment (การทำให้ใช้งานได้รายการใหม่)**
3. คลิกไอคอนรูปฟันเฟืองเลือกประเภท **Web App (เว็บแอป)**
4. ตั้งค่าดังนี้:
   - **Description**: `Production API v1.0`
   - **Execute as (ดำเนินการในฐานะ)**: `Me (ฉัน / อีเมลของคุณ)`
   - **Who has access (ผู้มีสิทธิ์เข้าถึง)**: `Anyone (ทุกคน)` *(สำคัญมาก เพื่อให้ Frontend เรียกใช้ API ได้)*
5. คลิก **Deploy** แล้วคัดลอก **Web App URL** (URL จะลงท้ายด้วย `/exec` เช่น `https://script.google.com/macros/s/AKfycbx.../exec`)

---

## 📌 ขั้นตอนที่ 2: นำโค้ดขึ้น GitHub

คุณสามารถสร้าง Repository บน GitHub แล้วสั่ง Push โค้ดได้ดังนี้:

```bash
git add .
git commit -m "feat: setup react frontend and gas api router for vercel"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo-name>.git
git push -u origin main
```

---

## 📌 ขั้นตอนที่ 3: Deploy Frontend บน Vercel

1. เข้าเว็บไซต์ [Vercel.com](https://vercel.com) แล้วล็อกอินด้วย GitHub
2. คลิก **Add New...** > **Project**
3. เลือก Repository ที่เพิ่งนำขึ้น GitHub
4. ในหน้าการตั้งค่าโปรเจกต์ (Project Configuration):
   - **Framework Preset**: `Vite`
   - **Root Directory**: คลิก Edit แล้วเลือกโฟลเดอร์ `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. *(ทางเลือก)* ในหัวข้อ **Environment Variables**:
   - เพิ่ม Key: `VITE_APPS_SCRIPT_URL`
   - Value: วาง Web App URL จากขั้นตอนที่ 1
6. คลิก **Deploy**

---

## 📌 ขั้นตอนที่ 4: การตั้งค่าเชื่อมต่อ URL ผ่านหน้าเว็บโดยตรง

หากไม่ได้ตั้ง Environment Variable ใน Vercel ก็สามารถตั้งค่าได้ง่ายๆ จากหน้าเว็บทันที:
1. เปิดหน้าเว็บที่ Deploy เสร็จแล้วบน Vercel
2. คลิกที่ปุ่มสีเหลือง/เขียวมุมบนขวา **"ตั้งค่า Apps Script URL"** หรือ **"API เชื่อมต่อแล้ว"**
3. วาง Web App URL ที่ได้จากขั้นตอนที่ 1 แล้วกดปุ่ม **"🔌 ทดสอบการเชื่อมต่อ"**
4. เมื่อขึ้นเชื่อมต่อสำเร็จ ให้กด **"บันทึกและใช้งาน"** ระบบจะจำ URL ไว้และซิงค์ข้อมูลกับ Google Sheets ตลอดไป
