# رسالة · Risala — Email-based Messaging Platform

منصة مراسلة فورية مستقلة (PWA) تعتمد **البريد الإلكتروني + معرّف رقمي فريد** بدلاً من رقم الهاتف.
واجهة عربية RTL / إنجليزية LTR، تصميم متجاوب مستوحى من WhatsApp بهوية بصرية أصلية.

---

## 1. التشغيل

```bash
npm install
# .env
# DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db
npx drizzle-kit push     # إنشاء/تحديث الجداول (Migrations آمنة)
node scripts/seed.mjs    # (اختياري) 3 حسابات تجريبية + محادثة + مجموعة + حالة
npm run build && npm start
```

حسابات تجريبية: `demo1@example.com` / `demo2@example.com` / `demo3@example.com` — كلمة المرور `Demo12345`
(بعد تغيير كلمة مرور demo3 في الاختبارات، استخدم `NewDemo12345` أو أعد تشغيل الـ seed).

المعرّفات: `RISALA01` (سارة) · `RISALA02` (Omar) · `RISALA03` (ليلى).

## 2. متغيرات البيئة

| المتغير | الوصف |
| --- | --- |
| `DATABASE_URL` | اتصال PostgreSQL (إلزامي) |
| `TURN_URL` | قائمة خوادم TURN مفصولة بفاصلة (اختياري، مطلوب لتجاوز NAT الصارم) |
| `TURN_USERNAME` / `TURN_CREDENTIAL` | بيانات اعتماد TURN (اختياري) |

STUN مضبوط افتراضياً (`stun.l.google.com:19302`, `stun:global.stun.twilio.com:3478`).
مفاتيح VAPID تُولَّد تلقائياً وتُخزَّن في جدول `app_settings` عند أول استخدام.

## 3. مخطط قاعدة البيانات (Drizzle / PostgreSQL)

| الجدول | الوصف | علاقات/فهارس |
| --- | --- | --- |
| `users` | الحساب، `public_id` فريد (8 خانات)، كلمة المرور scrypt، التفضيلات | unique(public_id), unique(email) |
| `sessions` | جلسات الأجهزة المتعددة + إمكانية الإلغاء | unique(token_hash), idx(user_id) |
| `password_resets` | رموز استعادة لمرة واحدة (30 دقيقة) | unique(token_hash) |
| `conversations` | محادثة مباشرة (`direct_key` فريد يمنع التكرار) أو مجموعة | unique(direct_key), idx(last_message_at) |
| `conversation_members` | الأعضاء + الدور (admin/member) + حالة القراءة/الكتم | unique(conversation_id,user_id), idx(user_id) |
| `messages` | نص/صورة/فيديو/صوت/مستند + رد + إعادة توجيه + تعديل + حذف | idx(conversation_id,id), unique(conversation_id,sender_id,client_id) |
| `message_receipts` | تسليم وقراءة لكل مستخدم | unique(message_id,user_id) |
| `reactions` | تفاعلات الرسائل | unique(message_id,user_id,emoji) |
| `typing_states` | مؤشر الكتابة (ينتهي بعد 6 ثوانٍ) | unique(conversation_id,user_id) |
| `blocks` / `reports` | الحظر والإبلاغ | unique(blocker_id,blocked_id) |
| `media` | بيانات الوسائط المرفوعة (الملف على القرص باسم المعرّف) | idx(owner_id) |
| `statuses` / `status_views` | الحالة 24 ساعة + تتبع المشاهدات | idx(expires_at), unique(status_id,viewer_id) |
| `calls` / `call_signals` | سجل المكالمات وإشارات WebRTC (offer/answer/ICE) | idx(callee_id), idx(call_id,id) |
| `push_subscriptions` | اشتراكات Web Push | unique(endpoint) |
| `app_settings` | مفاتيح VAPID | pk(key) |

## 4. الوظائف المكتملة والمُختبَرة فعلياً

| الميزة | الحالة | دليل الاختبار |
| --- | --- | --- |
| تسجيل/دخول/جلسات متعددة/خروج | ✅ | `POST /api/auth/register`, `login`, `GET /api/auth/sessions` |
| معرّف فريد 8 خانات + UNIQUE | ✅ |注册 جديد أنتج `QCVT82SR` |
| استعادة كلمة المرور | ✅ | رمز لمرة واحدة → `password` → كلمة المرور القديمة مرفوضة |
| بحث بالمعرّف + معاينة + بدء محادثة | ✅ | `GET /api/users/lookup?publicId=RISALA02` |
| منع تكرار المحادثة | ✅ | `existed: true` عند الإرسال الثاني |
| رسائل فورية + تسليم/قراءة | ✅ | `message:new` عبر SSE + `read` |
| تعديل/حذف/رد/إعادة توجيه/تفاعل | ✅ | `PATCH/DELETE /api/messages/:id`, `POST .../reactions` |
| مؤشر الكتابة والحضور | ✅ | `POST /api/conversations/:id/typing` → `typing: ["Omar Khaled"]` |
| ترقيم صفحات الرسائل | ✅ | `GET /api/conversations/:id/messages?before=` |
| وسائط (صور/فيديو/صوت/مستند) + حدود + أذونات | ✅ | 70MB → `file_too_large`؛ نوع غير مسموح → `unsupported_type`؛ غير عضو → 403 |
| حالة 24 ساعة + مشاهدات + جمهور | ✅ | `viewCount: 1` بعد المشاهدة |
| مجموعات + أدوار + إضافة/إزالة أعضاء | ✅ | عضو عادي → `admin_only` |
| مكالمات صوت/فيديو WebRTC + إشارات + سجل | ✅ | offer/answer/ICE عبر `/api/calls/:id/signal` |
| حظر/إبلاغ | ✅ | الحظر يمنع الإرسال (`error: blocked`) |
| Web Push + Service Worker + روابط عميقة | ✅ (تسجيل) | VAPID + `sw.js` + `notificationclick` → `/app?chat=id` |
| PWA (manifest + أيقونة + تثبيت) | ✅ | `/manifest.webmanifest`، `display: standalone` |
| RTL/LTR + ثيم فاتح/داكن + خلفيات | ✅ | تبديل اللغة/السمة من الإعدادات |
| إدارة التخزين + الأجهزة + الجلسات | ✅ | `GET /api/storage`، `GET /api/auth/sessions` |

### غير مكتمل / يحتاج إعداد خارجي
- **إرسال بريد الاستعادة فعلياً**: لا يوجد مزوّد بريد في هذه البيئة؛ الرابط يُعاد في الاستجابة (`note: no_email_provider`). يُستبدل بدالة `deliverResetLink` بمزوّد مثل Resend/SES.
- **TURN**: التطبيق يعمل عبر STUN؛ لتجاوز الشبكات الصارمة جداً اضبط `TURN_URL`.
- **APNs (iOS)**: Web Push على iOS يتطلب تثبيت التطبيق على الشاشة الرئيسية + شهادات APNs مرتبطة بمفاتيح VAPID.
- **اختبار الأجهزة الفعلية**: المكالمات بين متصفحين على نفس الشبكة تعمل؛ الاختبار بين شبكتين مختلفتين يتطلب TURN.

## 5. تثبيت PWA
- **Android/Chrome**: قائمة المتصفح ← «تثبيت التطبيق» أو زر التثبيت داخل التطبيق.
- **iOS/Safari**: زر المشاركة ← «إضافة إلى الشاشة الرئيسية» (الإشعارات تتطلب iOS 16.4+ بعد التثبيت).
- **سطح المكتب**: أيقونة التثبيت في شريط العنوان.

## 6. ملاحظات أمنية
- كلمات المرور: `scrypt` بملح عشوائي فريد.
- الجلسات: رمز عشوائي 32 بايت، يُخزَّن hash فقط، ويمكن إلغاؤه؛ إبطال كل الجلسات عند تغيير كلمة المرور.
- كل نقطة نهاية محمية بـ `requireAuthUser` + تحقق عضوية/ملكية على مستوى الخادم.
- الوسائط لا تُخدَّم من مجلد عام بل عبر `/api/media/:id` مع تحقق صلاحيات.
- Rate limiting لكل مسار (تسجيل/دخول/إرسال/رفع/حظر…).
- التحقق من المدخلات وتقييد الأحجام والأنواع، و`clientId` يمنع تكرار الرسائل عند إعادة المحاولة.
