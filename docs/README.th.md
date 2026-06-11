# CC-Viewer

เครื่องมือ Vibe Coding ที่สร้างบน Claude Code ซึ่งกลั่นกรองจากประสบการณ์การพัฒนาของผู้เขียนเอง:

1. ยกระดับเพดานความสามารถ — สามารถรัน /ultraPlan และ /ultraReview แบบโลคัล พร้อมหลีกเลี่ยงไม่ให้โค้ดโปรเจกต์ถูกเปิดเผยต่อคลาวด์ของ Claude ทั้งหมด
2. รองรับหลายอุปกรณ์พร้อมกัน — สามารถเขียนโปรแกรมบนอุปกรณ์มือถือ (ภายในเครือข่ายภายใน) เวอร์ชันเว็บปรับตัวเข้ากับสถานการณ์ต่าง ๆ ฝังในส่วนขยายเบราว์เซอร์หรือแบ่งหน้าจอของระบบปฏิบัติการได้ง่าย และยังมีแพ็กเกจติดตั้งแบบเนทีฟให้บริการ
3. บันทึก log อย่างครบถ้วน — ให้ความสามารถดักจับและวิเคราะห์ payload เต็มรูปแบบของ claude code เหมาะสำหรับการบันทึก log, วิเคราะห์ปัญหา, เรียนรู้และศึกษา, และวิศวกรรมย้อนกลับ
4. แบ่งปันประสบการณ์การเรียนรู้ — รวบรวมเอกสารการเรียนรู้และประสบการณ์การพัฒนาไว้มากมาย (ดูได้ที่ไอคอน "?" ตามจุดต่าง ๆ ในระบบ)
5. คงประสบการณ์เดิมไว้ — เพียงเสริมความสามารถของ claude code โดยไม่แก้ไขแกนกลางในเชิงสาระ คงประสบการณ์เนทีฟไว้
6. รองรับโมเดลของบุคคลที่สาม — รองรับ deepseek-v4-\*, GLM 5.1, Kimi K2.6 มาพร้อมความสามารถ cc-switch ในตัว สามารถสลับเครื่องมือของบุคคลที่สามได้ตลอดเวลา

<img width="860" alt="cc-viewer — deploy once, share with every device" src="https://raw.githubusercontent.com/weiesky/cc-viewer/main/docs/cc-viewer-share.svg" />

[English](../README.md) | [简体中文](./README.zh.md) | [繁體中文](./README.zh-TW.md) | [한국어](./README.ko.md) | [日本語](./README.ja.md) | [Deutsch](./README.de.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Italiano](./README.it.md) | [Dansk](./README.da.md) | [Polski](./README.pl.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md) | [Norsk](./README.no.md) | [Português (Brasil)](./README.pt-BR.md) | ไทย | [Türkçe](./README.tr.md) | [Українська](./README.uk.md)

## วิธีใช้งาน

### ข้อกำหนดเบื้องต้น

* ตรวจสอบให้แน่ใจว่าติดตั้ง nodejs 20.0.0+ แล้ว; [ดาวน์โหลดและติดตั้ง](https://nodejs.org)
* ตรวจสอบให้แน่ใจว่าติดตั้ง claude code แล้ว; [คู่มือการติดตั้ง](https://github.com/anthropics/claude-code)

### ติดตั้ง ccv

#### ติดตั้งผ่าน npm

```bash
npm install -g cc-viewer --registry=https://registry.npmjs.org
```

#### ติดตั้งผ่าน Homebrew (แนะนำสำหรับ macOS / Linux)

```bash
brew tap weiesky/cc-viewer
brew install cc-viewer
brew upgrade cc-viewer   # ใช้คำสั่งนี้ในการอัปเกรด — ccv ที่ติดตั้งผ่าน brew ห้ามอัปเกรดด้วย npm install -g
```

### วิธีเริ่มใช้งาน

ccv คือตัวแทนของ claude โดยตรง พารามิเตอร์ทั้งหมดจะถูกส่งต่อให้ claude พร้อมกับเปิด Web Viewer

```bash
ccv                    # == claude (โหมดโต้ตอบ)
```

คำสั่งที่ผู้เขียนใช้บ่อยที่สุดคือ

```
ccv -c --d             # == claude --continue --dangerously-skip-permissions
                       # ccv ส่งต่อพารามิเตอร์เริ่มต้นทั้งหมดของ claude code คุณสามารถผสมผสานใช้ได้ตามใจชอบ
```

หลังจากเริ่มโหมดเขียนโปรแกรมแล้ว เว็บเพจจะเปิดขึ้นโดยอัตโนมัติ

cc-viewer มีเวอร์ชันไคลเอนต์ให้บริการด้วย: [ลิงก์ดาวน์โหลด](https://github.com/weiesky/cc-viewer/releases)

### โหมด Logger

หากคุณยังคุ้นเคยกับการใช้เครื่องมือเนทีฟของ claude หรือปลั๊กอินของ VS code โปรดใช้โหมดนี้

ในโหมดนี้ การเริ่ม `claude`

จะเปิดโพรเซส log โดยอัตโนมัติ และบันทึก log คำขอไปยัง \~/.claude/cc-viewer/*yourproject*/date.jsonl

เริ่มโหมด logger:

```bash
ccv -logger
```

เมื่อคอนโซลไม่สามารถพิมพ์พอร์ตเฉพาะได้ พอร์ตเริ่มต้นแรกคือ 127.0.0.1:7008 หากมีหลายอินสแตนซ์พร้อมกันจะใช้พอร์ตถัดไปเรื่อย ๆ เช่น 7009, 7010

ถอนการติดตั้งโหมด logger:

```bash
ccv --uninstall
```

### การแก้ปัญหาที่พบบ่อย (Troubleshooting)

หากคุณพบปัญหาที่ไม่สามารถเริ่มได้ มีวิธีตรวจสอบขั้นสูงสุดดังนี้:
ขั้นที่ 1: เปิด claude code ในไดเรกทอรีใดก็ได้
ขั้นที่ 2: ให้คำสั่งกับ claude code ดังนี้:

```
我已经安装了cc-viewer这个npm包，但是执行ccv以后仍然无法有效运行。查看cc-viewer的cli.js 和 findcc.js，根据具体的环境，适配本地的claude code的部署方式。适配的时候修改范围尽量约束在findcc.js中。
```

การให้ Claude Code ตรวจสอบข้อผิดพลาดด้วยตัวเองนั้นมีประสิทธิภาพมากกว่าการปรึกษาใครหรืออ่านเอกสารใด ๆ!

หลังจากดำเนินการคำสั่งข้างต้นเสร็จแล้ว findcc.js จะได้รับการอัปเดต หากโปรเจกต์ของคุณจำเป็นต้องดีพลอยแบบโลคัลบ่อยครั้ง หรือโค้ดที่ fork ออกไปต้องแก้ปัญหาการติดตั้งบ่อย ๆ การเก็บไฟล์นี้ไว้จะมีประโยชน์ ครั้งต่อไปก็คัดลอกไฟล์ไปใช้ได้เลย ในปัจจุบันโปรเจกต์และบริษัทจำนวนมากที่ใช้ claude code ไม่ได้ดีพลอยบน mac แต่ดีพลอยแบบโฮสต์บนเซิร์ฟเวอร์ ผู้เขียนจึงแยก findcc.js ออกมาเป็นไฟล์ต่างหาก เพื่อให้ติดตามการอัปเดตซอร์สโค้ดของ cc-viewer ต่อไปได้สะดวก

หมายเหตุ: แอปพลิเคชันนี้ขัดแย้งกับ claude-code-switch และ claude-code-router เนื่องจากปัญหาการแย่ง proxy ดังนั้นเมื่อใช้งานต้องปิด claude-code-switch และ claude-code-router อย่างแน่นอน ภายใน cc-viewer มีฟังก์ชันการอัปเดต proxy แบบ hot-reload ให้ใช้แทนได้

### คำสั่งช่วยเหลืออื่น ๆ

ดู:

```bash
ccv -h
```

### โหมดเงียบ (Silent Mode)

โดยค่าเริ่มต้น `ccv` อยู่ในโหมดเงียบเมื่อห่อหุ้ม `claude` ทำให้เอาต์พุตของเทอร์มินัลยังคงเรียบร้อยและสอดคล้องกับประสบการณ์เนทีฟ log ทั้งหมดจะถูกจับในเบื้องหลังและสามารถดูได้ที่ `http://localhost:7008`

หลังจากตั้งค่าเสร็จแล้ว ใช้คำสั่ง `claude` ตามปกติได้เลย เข้าชม `http://localhost:7008` เพื่อดูอินเทอร์เฟซการมอนิเตอร์

## คุณสมบัติ

### โหมดเขียนโปรแกรม

หลังจากเริ่มใช้งานด้วย ccv คุณจะเห็น:

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/ab353a2b-f101-409d-a28c-6a4e41571ea2" />

คุณสามารถดู diff ของโค้ดได้ทันทีหลังจากแก้ไขเสร็จ:

<img height="728" width="1500" alt="image" src="https://github.com/user-attachments/assets/2a4acdaa-fc5f-4dc0-9e5f-f3273f0849b2" />

แม้คุณจะเปิดไฟล์และเขียนโปรแกรมด้วยตัวเองได้ แต่ไม่แนะนำให้เขียนเอง นั่นคือการเขียนโปรแกรมแบบโบราณ!

### การเขียนโปรแกรมบนมือถือ

คุณยังสามารถสแกน QR เพื่อเขียนโปรแกรมบนอุปกรณ์มือถือได้:

<img height="1460" width="3018" alt="image" src="https://github.com/user-attachments/assets/8debf48e-daec-420c-b37a-609f8b81cd20" />

<img height="790" width="1700" alt="image" src="https://github.com/user-attachments/assets/da3e519f-ff66-4cd2-81d1-f4e131215f6c" />

ตอบโจทย์จินตนาการเกี่ยวกับการเขียนโปรแกรมบนมือถือของคุณ นอกจากนี้ยังมีกลไกปลั๊กอิน หากคุณต้องการปรับแต่งให้ตรงกับนิสัยการเขียนโปรแกรมของตัวเอง สามารถติดตามการอัปเดต hooks ของปลั๊กอินต่อไปได้

### โหมด Logger (ดูเซสชันที่สมบูรณ์ของ claude code)

<img height="768" width="1500" alt="image" src="https://github.com/user-attachments/assets/a8a9f3f7-d876-4f6b-a64d-f323a05c4d21" />

* ดักจับคำขอ API ทั้งหมดที่ Claude Code ส่งออกแบบเรียลไทม์ รับรองว่าเป็นข้อความต้นฉบับ ไม่ใช่ log ที่ถูกตัดทอน (สิ่งนี้สำคัญมาก!!!)
* ระบุและทำเครื่องหมายคำขอของ Main Agent และ Sub Agent โดยอัตโนมัติ (ชนิดย่อย: Plan, Search, Bash)
* คำขอของ MainAgent รองรับ Body Diff JSON แสดงผลต่างจากคำขอ MainAgent ก่อนหน้าแบบพับเก็บไว้ (แสดงเฉพาะฟิลด์ที่เปลี่ยน/เพิ่มใหม่)
* แต่ละคำขอแสดงสถิติการใช้ Token แบบ inline (Token อินพุต/เอาต์พุต, การสร้าง/อ่านแคช, อัตราการ hit)
* รองรับ Claude Code Router (CCR) และสถานการณ์พร็อกซีอื่น ๆ — ใช้การจับคู่รูปแบบเส้นทาง API เป็นแนวสำรอง

<a href="https://www.star-history.com/?repos=weiesky%2Fcc-viewer&type=date&legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=weiesky/cc-viewer&type=date&theme=dark&legend=top-left" />

    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=weiesky/cc-viewer&type=date&legend=top-left" />

    ![Star History Chart](https://api.star-history.com/chart?repos=weiesky/cc-viewer&type=date&legend=top-left)
  </picture>
</a>

## License

MIT
