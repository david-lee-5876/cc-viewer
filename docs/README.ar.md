# CC-Viewer

أداة Vibe Coding مبنية على Claude Code، تم تقطيرها من تجربة التطوير الذاتية:

1. رفع سقف القدرات — يمكنك تشغيل /ultraPlan و/ultraReview محليًا، مع تجنّب كشف كود مشروعك بالكامل لسحابة Claude؛
2. التوافق مع أجهزة متعددة في وقت واحد — يمكن البرمجة من الأجهزة المحمولة (داخل الشبكة المحلية)، وتتكيف النسخة الويب مع مختلف السيناريوهات، ويسهل تضمينها في إضافات المتصفح أو شاشة منقسمة لنظام التشغيل، كما تتوفر حزمة تثبيت أصلية؛
3. حفظ كامل للسجلات — توفر القدرة على اعتراض وتحليل payload كامل لـ claude code، ومناسبة لتسجيل السجلات وتحليل المشكلات والتعلم والاستفادة والهندسة العكسية؛
4. مشاركة خبرات التعلم — تم تجميع الكثير من مواد التعلم وخبرات التطوير (راجع علامات "؟" في مختلف أنحاء النظام)؛
5. الحفاظ على التجربة الأصلية — يقتصر على تعزيز قدرات claude code دون أي تعديلات جوهرية على النواة، مع الحفاظ على التجربة الأصلية؛
6. التوافق مع نماذج الطرف الثالث — يدعم deepseek-v4-\* وGLM 5.1 وKimi K2.6، مع قدرة cc-switch مدمجة، يمكنك التبديل الساخن بين أدوات الطرف الثالث في أي وقت؛

<img width="860" alt="cc-viewer — deploy once, share with every device" src="https://raw.githubusercontent.com/weiesky/cc-viewer/main/docs/cc-viewer-share.svg" />

[English](../README.md) | [简体中文](./README.zh.md) | [繁體中文](./README.zh-TW.md) | [한국어](./README.ko.md) | [日本語](./README.ja.md) | [Deutsch](./README.de.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Italiano](./README.it.md) | [Dansk](./README.da.md) | [Polski](./README.pl.md) | [Русский](./README.ru.md) | العربية | [Norsk](./README.no.md) | [Português (Brasil)](./README.pt-BR.md) | [ไทย](./README.th.md) | [Türkçe](./README.tr.md) | [Українська](./README.uk.md)

## طريقة الاستخدام

### المتطلبات المسبقة

* تأكد من تثبيت nodejs 20.0.0+؛ [التنزيل والتثبيت](https://nodejs.org)
* تأكد من تثبيت claude code؛ [دليل التثبيت](https://github.com/anthropics/claude-code)

### تثبيت ccv

#### التثبيت عبر npm

```bash
npm install -g cc-viewer --registry=https://registry.npmjs.org
```

#### التثبيت عبر Homebrew (مُوصى به لـ macOS / Linux)

```bash
brew tap weiesky/cc-viewer
brew install cc-viewer
brew upgrade cc-viewer   # استخدم هذا للترقية؛ لا تستخدم npm install -g لترقية ccv المثبّت عبر brew
```

### طريقة التشغيل

ccv هو بديل مباشر لـ claude، حيث يتم تمرير جميع المعاملات إلى claude مع تشغيل Web Viewer في الوقت نفسه.

```bash
ccv                    # == claude (الوضع التفاعلي)
```

أكثر أمر يستخدمه المؤلف نفسه هو

```
ccv -c --d             # == claude --continue --dangerously-skip-permissions
                       # يمرر ccv جميع معاملات تشغيل claude code، ويمكنك دمجها كما تشاء
```

بعد تشغيل وضع البرمجة، ستُفتح صفحة الويب تلقائيًا.

يوفر cc-viewer أيضًا إصدار العميل: [رابط التنزيل](https://github.com/weiesky/cc-viewer/releases)

### وضع التسجيل (Logger)

إذا كنت ما زلت معتادًا على استخدام أداة claude الأصلية أو إضافة VS code، فيرجى استخدام هذا الوضع.

في هذا الوضع، عند تشغيل `claude`

سيتم تلقائيًا تشغيل عملية تسجيل تقوم بتسجيل سجلات الطلبات في \~/.claude/cc-viewer/*yourproject*/date.jsonl

تشغيل وضع التسجيل:

```bash
ccv -logger
```

عندما لا يمكن لوحدة التحكم طباعة منفذ محدد، يكون المنفذ الافتراضي الأول للتشغيل هو 127.0.0.1:7008. في حالة وجود عدة نسخ تعمل في وقت واحد، تتسلسل المنافذ مثل 7009 و7010.

إلغاء تثبيت وضع التسجيل:

```bash
ccv --uninstall
```

### استكشاف الأخطاء وإصلاحها (Troubleshooting)

إذا واجهت مشاكل في عدم القدرة على التشغيل، فهناك حل نهائي لاستكشاف الأخطاء:
الخطوة الأولى: افتح claude code في أي دليل؛
الخطوة الثانية: امنح claude code التعليمات التالية:

```
我已经安装了cc-viewer这个npm包，但是执行ccv以后仍然无法有效运行。查看cc-viewer的cli.js 和 findcc.js，根据具体的环境，适配本地的claude code的部署方式。适配的时候修改范围尽量约束在findcc.js中。
```

إن السماح لـ Claude Code بفحص الأخطاء بنفسه أكثر فعالية من استشارة أي شخص أو قراءة أي وثائق!

بعد إكمال التعليمات أعلاه، سيتم تحديث findcc.js. إذا كان مشروعك يحتاج إلى النشر المحلي بشكل متكرر، أو إذا كان الكود المُنسوخ (forked) يحتاج إلى حل مشاكل التثبيت بشكل متكرر، فاحتفظ بهذا الملف. في المرة القادمة يمكنك نسخه مباشرة. في المرحلة الحالية، تستخدم العديد من المشاريع والشركات claude code بنشر مستضاف على الخادم وليس على mac، لذلك فصل المؤلف ملف findcc.js لتسهيل تتبع تحديثات الكود المصدري لـ cc-viewer لاحقًا.

ملاحظة: يتعارض هذا التطبيق مع claude-code-switch وclaude-code-router، إذ توجد مشكلة تنافس على proxy، لذا عند الاستخدام يجب إغلاق claude-code-switch وclaude-code-router؛ يوفر cc-viewer داخليًا وظيفة تحديث ساخن للوكيل كبديل مكافئ.

### أوامر مساعدة أخرى

للاطلاع:

```bash
ccv -h
```

### الوضع الصامت (Silent Mode)

افتراضيًا، يعمل `ccv` في الوضع الصامت عند تغليف `claude`، مما يضمن بقاء مخرجات الطرفية الخاصة بك مرتبة ومتسقة مع التجربة الأصلية. يتم التقاط جميع السجلات في الخلفية ويمكن عرضها عبر `http://localhost:7008`.

بعد اكتمال الإعداد، استخدم أمر `claude` بشكل طبيعي. زر `http://localhost:7008` لعرض واجهة المراقبة.

## الميزات

### وضع البرمجة

بعد التشغيل باستخدام ccv ستشاهد:

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/ab353a2b-f101-409d-a28c-6a4e41571ea2" />

يمكنك مباشرة عرض diff الكود بعد إتمام التحرير:

<img height="728" width="1500" alt="image" src="https://github.com/user-attachments/assets/2a4acdaa-fc5f-4dc0-9e5f-f3273f0849b2" />

على الرغم من أنه يمكنك فتح الملفات والبرمجة يدويًا، إلا أن البرمجة اليدوية غير مُوصى بها — تلك هي البرمجة بالطريقة القديمة!

### البرمجة على الأجهزة المحمولة

يمكنك حتى مسح رمز QR لتحقيق البرمجة على الأجهزة المحمولة:

<img height="1460" width="3018" alt="image" src="https://github.com/user-attachments/assets/8debf48e-daec-420c-b37a-609f8b81cd20" />

<img height="790" width="1700" alt="image" src="https://github.com/user-attachments/assets/da3e519f-ff66-4cd2-81d1-f4e131215f6c" />

يلبي تصوراتك حول البرمجة على الأجهزة المحمولة، بالإضافة إلى ذلك توجد آلية للإضافات، وإذا كنت بحاجة إلى التخصيص وفقًا لعاداتك في البرمجة، يمكنك متابعة تحديثات hooks الإضافات لاحقًا.

### وضع التسجيل (عرض الجلسة الكاملة لـ claude code)

<img height="768" width="1500" alt="image" src="https://github.com/user-attachments/assets/a8a9f3f7-d876-4f6b-a64d-f323a05c4d21" />

* التقاط جميع طلبات API الصادرة من Claude Code في الوقت الفعلي، مع ضمان أنها هي النص الأصلي وليست سجلات تم اقتطاعها (هذا مهم جدًا!!!)
* التعرف التلقائي على طلبات Main Agent وSub Agent ووسمها (الأنواع الفرعية: Plan، Search، Bash)
* تدعم طلبات MainAgent ميزة Body Diff JSON، حيث تعرض الفرق عن طلب MainAgent السابق بشكل مطوي (تعرض فقط الحقول المتغيرة/الجديدة)
* يعرض كل طلب إحصائيات استخدام Token مدمجة (Token الإدخال/الإخراج، إنشاء/قراءة التخزين المؤقت، معدل الإصابة)
* متوافق مع Claude Code Router (CCR) وسيناريوهات الوكيل الأخرى — مع مطابقة أنماط مسار API كحل احتياطي

<a href="https://www.star-history.com/?repos=weiesky%2Fcc-viewer&type=date&legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=weiesky/cc-viewer&type=date&theme=dark&legend=top-left" />

    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=weiesky/cc-viewer&type=date&legend=top-left" />

    ![Star History Chart](https://api.star-history.com/chart?repos=weiesky/cc-viewer&type=date&legend=top-left)
  </picture>
</a>

## License

MIT
