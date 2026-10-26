#  ขั้นตอนและคำสั่งสำหรับปล่อย Release (Release Pipeline Guide)

คู่มือฉบับสมบูรณ์ทีละขั้นตอน สำหรับการพัฒนาโค้ด ปรับปรุงเวอร์ชัน และปล่อยตัวติดตั้ง `.exe` ขึ้นสู่ **GitHub Releases** โดยใช้ **GitHub CLI (`gh`)** เพื่อให้ผู้ใช้งานเดิมได้รับการแจ้งเตือนและกดอัปเดตอัตโนมัติ

---

##  ภาพรวมวงจรการอัปเดต (Release Lifecycle)

```text
1. แก้ไข/เพิ่มฟีเจอร์โค้ด  2. ปรับเลข version ใน package.json  3. Git Commit & Push
         4. สั่งบิลด์ npm run dist  5. gh release create แนบไฟล์ .exe  6. เสร็จสิ้น!
```

---

## ️ ขั้นตอนที่ 0: ติดตั้งเครื่องมือ (ทำครั้งแรกเพียงครั้งเดียว)

หากเครื่องคอมพิวเตอร์ของคุณยังไม่เคยติดตั้งหรือล็อกอิน `gh` ให้ทำตามขั้นตอนนี้ก่อน:

1. **ติดตั้ง GitHub CLI ผ่าน PowerShell:**

   ```powershell
   winget install --id GitHub.cli
   ```

   _(เมื่อติดตั้งเสร็จ ให้ปิดแล้วเปิดหน้าต่าง PowerShell ใหม่ 1 ครั้ง)_

2. **ล็อกอินเข้าบัญชี GitHub:**

   ```powershell
   gh auth login
   ```

   - เลือก: `GitHub.com`
   - เลือกโปรโตคอล: `HTTPS`
   - เลือกล็อกอินด้วย Git Credentials: `Yes`
   - เลือกวิธียืนยันตัวตน: `Login with a web browser`
   - ระบบจะแสดงโค้ด 8 ตัวอักษร ให้กด `Enter` เพื่อเปิดเบราว์เซอร์ไปวางโค้ดยืนยัน

---

##  ขั้นตอนการอัปเดตในแต่ละรอบ (ตั้งแต่เริ่มแก้โค้ดจนถึงปล่อย Release)

สมมติว่าคุณต้องการปล่อยเวอร์ชันใหม่ เช่น จาก `1.0.0` ไปเป็น **`1.1.0`**

### 1. ปรับเลขเวอร์ชันใน `package.json`

เปิดไฟล์ `package.json` แล้วเปลี่ยนเลขเวอร์ชัน:

```json
{
  "name": "pyknw-studio",
  "version": "1.1.0",
  ...
}
```

_(แอปจะนำเลขนี้ไปแสดงที่แถบ Status Bar ด้านล่าง และใช้ตรวจสอบการอัปเดต)_

---

### 2. เตรียมเนื้อหาบันทึกการเปลี่ยนแปลง (Release Notes)

สร้างหรือแก้ไขไฟล์ `RELEASE_NOTES.md` ในโฟลเดอร์โปรเจกต์ เช่น:

```markdown
###  มีอะไรใหม่ใน v1.1.0

- เพิ่มช่องป้อนข้อมูลอินพุต (Console Input Bar) สำหรับคำสั่ง input()
- เพิ่มระบบตรวจจับและอัปเดตเวอร์ชันใหม่อัตโนมัติจาก GitHub Releases
- เพิ่มปุ่มบันทึกเป็น (Save As) และบังคับบันทึกไฟล์ก่อนสั่งรัน
- ปรับสไตล์ปุ่ม Toolbar สไตล์ VS Code Flat Theme
```

---

### 3. บันทึกและส่งโค้ดขึ้น GitHub (Git Workflow)

เปิด PowerShell ในโฟลเดอร์โปรเจกต์ แล้วพิมพ์คำสั่งเรียงตามลำดับ:

```powershell
# 1. ตรวจสอบดูไฟล์ที่มีการเปลี่ยนแปลง
git status

# 2. นำไฟล์ทั้งหมดเข้าสู่การเตรียมบันทึก
git add .

# 3. บันทึกประวัติการเปลี่ยนแปลง (Commit)
git commit -m "chore(release): bump version to 1.1.0"

# 4. ส่งโค้ดขึ้นสู่ GitHub
git push origin main
```

---

### 4. แพ็กแอปพลิเคชันเป็นไฟล์ `.exe` สำหรับติดตั้ง

สั่งบิลด์ตัวติดตั้งด้วยคำสั่ง:

```powershell
npm run dist
```

- รอระบบคอมไพล์และแพ็กเกจ (ใช้เวลาประมาณ 1–2 นาที)
- เมื่อเสร็จสิ้น คุณจะได้ไฟล์ตัวติดตั้งใหม่ในโฟลเดอร์ `dist/` เช่น:
   `dist/PyKNW Studio Setup 1.1.0.exe`

---

### 5. สั่งสร้าง Release บน GitHub พร้อมอัปโหลดไฟล์ `.exe` (คำสั่งเดียวจบ!)

ใช้ GitHub CLI สั่งสร้าง Release และแนบไฟล์ `.exe` ขึ้น GitHub ทันที:

```powershell
gh release create v1.1.0 "dist/PyKNW Studio Setup 1.1.0.exe" --title "PyKNW Studio v1.1.0" --notes-file RELEASE_NOTES.md
```

> **คำอธิบายพารามิเตอร์:**
>
> - `v1.1.0` : ชื่อ Git Tag (ต้องตรงกับเลขเวอร์ชันและมีตัว `v` นำหน้า)
> - `"dist/PyKNW Studio Setup 1.1.0.exe"` : ไฟล์ตัวติดตั้งที่จะแนบขึ้น Assets
> - `--title "..."` : หัวข้อของ Release ที่จะแสดงบนหน้าเว็บ
> - `--notes-file RELEASE_NOTES.md` : ดึงเนื้อหารายละเอียดมาจากไฟล์ Markdown ที่เราเตรียมไว้

---

##  สรุปคำสั่งแบบด่วน (Fast-Track Cheat Sheet)

สำหรับการอัปเดตรอบถัดไป คุณสามารถคัดลอกคำสั่งชุดนี้ไปรันได้เลย:

```powershell
# 1. บันทึกโค้ด
git add .
git commit -m "chore(release): release v1.1.0"
git push origin main

# 2. แพ็กตัวติดตั้ง
npm run dist

# 3. ปล่อย Release ทันที
gh release create v1.1.0 "dist/PyKNW Studio Setup 1.1.0.exe" --title "PyKNW Studio v1.1.0" --notes-file RELEASE_NOTES.md
```

---

##  การตรวจสอบผลลัพธ์หลังปล่อย Release

1. **ตรวจสอบบนหน้าเว็บ GitHub:**เข้าไปที่ `https://github.com/nawa-dev/PyKNW/releases`จะพบ Release `v1.1.0` มีหัวข้อ, รายละเอียด และไฟล์ `PyKNW Studio Setup 1.1.0.exe` อยู่ในส่วน **Assets** เรียบร้อย
2. **ทดสอบระบบ Auto-Update:**
   เปิดแอป PyKNW Studio ตัวเก่า (v1.0.0) ในเครื่อง
   แอปจะตรวจพบและเด้งป๊อปอัปแจ้งเตือนพร้อมปุ่ม **[ อัปเดตทันที ]** เมื่อกดแล้วจะดาวน์โหลดและติดตั้งเวอร์ชันใหม่ให้โดยอัตโนมัติ
