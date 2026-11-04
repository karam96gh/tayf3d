# موقع طيف v2 — Tayf 3D

النسخة المتقدمة من موقع طيف: صفحة تعريفية بخدماتنا، وبنفس الوقت عرض حي لقوة شغلنا بالـ 3D.
كل الأدوات مجانية ومفتوحة المصدر.

## شو في بالموقع

| القسم | التقنية |
| --- | --- |
| الهيرو: شعار طيف كزجاج حقيقي، ضو أبيض بيدخل وبيطلع 5 ألوان | `MeshPhysicalNodeMaterial` مع transmission + dispersion، والضو بيلحق الماوس |
| جزيئات الضو (حتى 65,536 جزيء) | Compute shader بـ TSL على WebGPU، وعلى WebGL 2 عن طريق transform feedback |
| الخدمات: الجزيئات بتتحوّل لكوكب، مدينة، ومجرّة | أشكال محسوبة بالكود، والانتقال بينها مربوط بالتمرير |
| المختبر: زجاجة عطر بتغيّر لونها وغطاها وكميتها | Configurator لحاله، زجاج وسائل بينكسر فيه الضو وانعكاسات استوديو |
| طبقة طبقة: موقع وهمي بينفصل لأربع طبقات | مستويات مرسومة على Canvas ومحرّكة بالتمرير |
| كيف منشتغل والأدوات | CSS Scroll-Driven Animations بدون جافاسكربت |
| كلمة «طيف» بآخر الصفحة | نص عربي مرسوم على Canvas ومتحوّل لجزيئات |

## الأدوات

- **Vite 8 + TypeScript**: المحتوى HTML ثابت (ممتاز لمحركات البحث)، والـ 3D بيتحمّل وراه.
- **three.js r186 (WebGPURenderer + TSL)**: بيشتغل على WebGPU، وإذا المتصفح ما بيدعمه بيتحوّل لحاله لـ WebGL 2.
- **GSAP 3.15 + ScrollTrigger**: ربط المشاهد بالتمرير.
- **Lenis**: تمرير ناعم.
- **Fontsource**: خطوط Alexandria و Unbounded محلية.

## التشغيل على جهازك

```bash
npm install
npm run dev        # http://localhost:5173
```

## البناء والنشر

```bash
npm run build      # الموقع الجاهز بيطلع بمجلد dist/
npm run preview    # معاينة النسخة النهائية
```

مجلد `dist/` بيطلع جاهز للرفع، وكل مساراته نسبية فبيشتغل من أي مجلد أو استضافة.

### النشر على GitHub Pages مع الدومين tayf3d.com

الموقع بيتنشر لحاله: كل `git push` على فرع `main` بيشغّل `.github/workflows/deploy.yml`،
وهاد بيبني الموقع وبيرفعه على GitHub Pages.

مرة وحدة بس:
1. بالـ repo: Settings ← Pages ← Source: **GitHub Actions**.
2. بنفس الصفحة: Custom domain ← `tayf3d.com` ← Save.
3. بـ Namecheap ← Domain List ← Manage ← Advanced DNS، احذف السجلات الافتراضية وضيف:

| Type | Host | Value |
| --- | --- | --- |
| A Record | @ | 185.199.108.153 |
| A Record | @ | 185.199.109.153 |
| A Record | @ | 185.199.110.153 |
| A Record | @ | 185.199.111.153 |
| CNAME Record | www | karam96gh.github.io. |

4. لما يصير الفحص أخضر بصفحة Pages، فعّل **Enforce HTTPS**.

### أو على سيرفرك (nginx)

```nginx
server {
  server_name tayf3d.com www.tayf3d.com;
  root /var/www/tayf3d;
  index index.html;
  location / { try_files $uri $uri/ /index.html; }
  location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
}
```

## التعديل

- **رقم الواتساب والإيميل والانستغرام:** `src/config.ts`. حط رقمك بحقل `whatsapp` (مثال `963912345678`)، وكل أزرار «ابدأ مشروعك» بتفتح واتساب برسالة جاهزة.
- **النصوص:** كلها بـ `index.html`.
- **الألوان والتنسيق:** `src/styles/main.css` (المتغيرات بأول الملف).
- **مشاهد الجزيئات:** الأشكال بـ `src/world/shapes.ts`، والفيزياء والألوان بـ `src/world/Particles.ts`.
- **الزجاج والضو بالهيرو:** `src/world/Prism.ts`.
- **المختبر (زجاجة العطر):** `src/lab/Configurator.ts`. الألوان والأغطية بأول الملف.
- **ترتيب المشاهد مع التمرير:** `src/main.ts` (جدول `SCENES`).

## الأداء والتوافق

- الموقع بيقيس جهاز الزائر: 65,536 جزيء على WebGPU، 32,768 على WebGL 2، وأقل على الموبايل.
- إذا الفريمات نزلت، الدقة بتنزل لحالها لحتى يضل ناعم.
- مختبر الزجاجة ما بيشتغل إلا لما توصله، وبيوقف لما تطلع منه.
- إذا الزائر مفعّل «تقليل الحركة»، الحركة والتمرير الناعم بيوقفوا.
- إذا الجهاز ما بيدعم أي 3D، بتطلع خلفية ثابتة وصورة للزجاجة، والمحتوى كله بيضل شغّال.

## للتجربة

- `?webgl` بآخر الرابط: بيجبر الموقع يشتغل على WebGL 2 بدل WebGPU.
- `?count=8192`: بيغيّر عدد الجزيئات.
