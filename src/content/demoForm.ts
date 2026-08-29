/** Option lists + bilingual labels for the Book a Demo flow. */

export const INDUSTRIES = [
  "Banking",
  "Finance",
  "Healthcare",
  "Legal",
  "Enterprise Services",
  "Other",
] as const;

export const USE_CASES = [
  "Customer Support",
  "Collections",
  "Outbound Campaigns",
  "Identity Verification",
  "Appointment Scheduling",
  "Fraud Detection",
  "Other",
] as const;

export const CALL_VOLUMES = [
  "Under 1,000",
  "1,000–10,000",
  "10,000–100,000",
  "100,000+",
] as const;

export const COUNTRIES = [
  "Jordan",
  "Saudi Arabia",
  "United Arab Emirates",
  "Kuwait",
  "Qatar",
  "Bahrain",
  "Oman",
  "Egypt",
  "Lebanon",
  "Iraq",
  "Morocco",
  "Tunisia",
  "Algeria",
  "Libya",
  "Yemen",
  "Palestine",
  "Turkey",
  "United Kingdom",
  "United States",
  "France",
  "Germany",
  "Other",
] as const;

/** Free consumer providers — a work address is asked for, and that is enforced. */
export const CONSUMER_EMAIL_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "mail.com",
  "gmx.com",
  "gmx.net",
  "yandex.com",
  "yandex.ru",
  "qq.com",
  "163.com",
  "rediffmail.com",
];

export type Lang = "en" | "ar";

export const STRINGS: Record<
  Lang,
  {
    dir: "ltr" | "rtl";
    label: string;
    title: string;
    intro: string;
    sections: { contact: string; scope: string; context: string };
    fields: Record<string, { label: string; placeholder: string; optional?: string }>;
    options: { industries: Record<string, string>; useCases: Record<string, string>; volumes: Record<string, string> };
    consent: string;
    submit: string;
    submitting: string;
    cancel: string;
    errors: Record<string, string>;
    summary: (n: number) => string;
    done: {
      localTitle: string;
      localBody: string;
      deliveredTitle: string;
      deliveredBody: string;
      errorTitle: string;
      review: string;
      copy: string;
      copied: string;
      mail: string;
      download: string;
      edit: string;
      devNote: string;
      none: string;
    };
    counter: (n: number, max: number) => string;
  }
> = {
  en: {
    dir: "ltr",
    label: "English",
    title: "Book a demo",
    intro:
      "A 30-minute working session with a live Arabic and English agent. We reply with two time slots and a short pre-call questionnaire.",
    sections: { contact: "How to reach you", scope: "What you need", context: "Entry point" },
    fields: {
      name: { label: "Full name", placeholder: "Rania Haddad" },
      company: { label: "Organisation", placeholder: "Bank, clinic, firm…" },
      email: { label: "Work email", placeholder: "you@organisation.jo" },
      phone: { label: "Phone", placeholder: "+962 7X XXX XXXX" },
      country: { label: "Country", placeholder: "Select a country" },
      industry: { label: "Industry", placeholder: "" },
      useCase: { label: "Primary use case", placeholder: "" },
      volume: { label: "Expected monthly call volume", placeholder: "" },
      message: {
        label: "Message",
        placeholder:
          "Inbound balance and card enquiries in Jordanian Arabic, outbound reminder campaigns on Tuesdays, CliQ payment links, CRM handover…",
        optional: "Optional, but it shapes the session",
      },
    },
    options: {
      industries: {
        Banking: "Banking",
        Finance: "Finance",
        Healthcare: "Healthcare",
        Legal: "Legal",
        "Enterprise Services": "Enterprise Services",
        Other: "Other",
      },
      useCases: {
        "Customer Support": "Customer Support",
        Collections: "Collections",
        "Outbound Campaigns": "Outbound Campaigns",
        "Identity Verification": "Identity Verification",
        "Appointment Scheduling": "Appointment Scheduling",
        "Fraud Detection": "Fraud Detection",
        Other: "Other",
      },
      volumes: {
        "Under 1,000": "Under 1,000",
        "1,000–10,000": "1,000 – 10,000",
        "10,000–100,000": "10,000 – 100,000",
        "100,000+": "100,000+",
      },
    },
    consent: "I agree that CenterAI may use these details to respond to this request.",
    submit: "Validate & continue",
    submitting: "Checking…",
    cancel: "Edit details",
    errors: {
      required: "Required.",
      "name.short": "Please enter at least 2 characters.",
      "name.chars": "Letters, spaces, hyphens and apostrophes only.",
      "company.short": "Please enter your organisation's full name.",
      "email.format": "Enter a valid email address, e.g. name@organisation.com.",
      "email.free": "Please use your work email — consumer inboxes are not accepted.",
      "email.length": "That address is too long.",
      "phone.digits": "Enter a phone number with 7–15 digits, including country code.",
      "phone.chars": "Digits, spaces and + ( ) - . only.",
      country: "Select a country.",
      industry: "Select an industry.",
      useCase: "Select a use case.",
      volume: "Select an expected volume.",
      "message.short": "Add at least 10 characters, or leave this empty.",
      "message.long": "Please keep the message under 1,200 characters.",
      consent: "Please confirm before continuing.",
      generic: "Please check this field.",
    },
    summary: (n) => `${n} ${n === 1 ? "field needs" : "fields need"} attention before you continue.`,
    done: {
      localTitle: "Validated locally — nothing was sent",
      localBody:
        "Every field passed validation. This build has no backend, so the request was not delivered anywhere. Send it to us, or save it, using the options below.",
      deliveredTitle: "Request received",
      deliveredBody: "Your request was accepted. A solutions engineer will follow up.",
      errorTitle: "Could not send the request",
      review: "What will be sent",
      copy: "Copy request",
      copied: "Copied",
      mail: "Send via email",
      download: "Download JSON",
      edit: "Back to form",
      devNote:
        "Wire-up: POST this payload to an endpoint set as VITE_DEMO_ENDPOINT. The form already handles delivered, error and retry states.",
      none: "Not provided",
    },
    counter: (n, max) => `${n} / ${max}`,
  },

  ar: {
    dir: "rtl",
    label: "العربية",
    title: "حجز عرض تجريبي",
    intro:
      "جلسة عمل لمدة 30 دقيقة مع وكيل صوتي مباشر بالعربية والإنجليزية. نرد عليك بموعدَين ونموذج أسئلة قصير قبل المكالمة.",
    sections: { contact: "كيف نتواصل معك", scope: "ما تحتاجه", context: "نقطة البداية" },
    fields: {
      name: { label: "الاسم الكامل", placeholder: "رنا حداد" },
      company: { label: "المؤسسة", placeholder: "بنك، عيادة، مكتب محاماة…" },
      email: { label: "البريد الإلكتروني للعمل", placeholder: "you@organisation.jo" },
      phone: { label: "رقم الهاتف", placeholder: "+962 7X XXX XXXX" },
      country: { label: "الدولة", placeholder: "اختر الدولة" },
      industry: { label: "القطاع", placeholder: "" },
      useCase: { label: "حالة الاستخدام الأساسية", placeholder: "" },
      volume: { label: "عدد المكالمات المتوقع شهرياً", placeholder: "" },
      message: {
        label: "ملاحظات",
        placeholder:
          "استعلامات الرصيد والبطاقات باللهجة الأردنية، حملات تنبيه outbound أيام الثلاثاء، روابط دفع CliQ، الربط مع نظام إدارة العلاقات…",
        optional: "اختياري، لكنه يساعدنا في تجهيز الجلسة",
      },
    },
    options: {
      industries: {
        Banking: "المصارف",
        Finance: "الخدمات المالية",
        Healthcare: "الرعاية الصحية",
        Legal: "القانوني",
        "Enterprise Services": "خدمات المؤسسات",
        Other: "أخرى",
      },
      useCases: {
        "Customer Support": "خدمة العملاء",
        Collections: "التحصيل",
        "Outbound Campaigns": "الحملات الصادرة",
        "Identity Verification": "التحقق من الهوية",
        "Appointment Scheduling": "جدولة المواعيد",
        "Fraud Detection": "كشف الاحتيال",
        Other: "أخرى",
      },
      volumes: {
        "Under 1,000": "أقل من 1,000",
        "1,000–10,000": "1,000 – 10,000",
        "10,000–100,000": "10,000 – 100,000",
        "100,000+": "أكثر من 100,000",
      },
    },
    consent: "أوافق على أن تستخدم CenterAI هذه البيانات للرد على طلبي.",
    submit: "تحقق وأكمل",
    submitting: "جارٍ التحقق…",
    cancel: "رجوع إلى النموذج",
    errors: {
      required: "هذا الحقل مطلوب.",
      "name.short": "الرجاء إدخال حرفَين على الأقل.",
      "name.chars": "الحروف والمسافات والشرطات وعلامات الاقتباس فقط.",
      "company.short": "الرجاء كتابة الاسم الكامل للمؤسسة.",
      "email.format": "أدخل بريداً إلكترونياً صحيحاً، مثل name@organisation.com.",
      "email.free": "يرجى استخدام بريد العمل — لا نقبل صناديق البريد الشخصية.",
      "email.length": "طول العنوان أكبر من المسموح.",
      "phone.digits": "أدخل رقماً دولياً بين 7 و 15 خانة مع رمز الدولة.",
      "phone.chars": "أرقام ومسافات و + ( ) - . فقط.",
      country: "اختر الدولة.",
      industry: "اختر القطاع.",
      useCase: "اختر حالة الاستخدام.",
      volume: "اختر عدد المكالمات المتوقع.",
      "message.short": "اكتب 10 أحرف على الأقل أو اترك الحقل فارغاً.",
      "message.long": "الرجاء ألا تتجاوز الملاحظة 1200 حرف.",
      consent: "الرجاء التأكيد قبل المتابعة.",
      generic: "الرجاء التحقق من هذا الحقل.",
    },
    summary: (n) => `${n} ${n === 1 ? "حقل يحتاج" : "حقول تحتاج"} تصحيحاً قبل المتابعة.`,
    done: {
      localTitle: "تم التحقق محلياً — لم يُرسل شيء",
      localBody:
        "كل الحقول اجتزت التحقق. هذا الإصدار لا يملك خادماً، لذلك لم يُرسل الطلب إلى أي جهة. يمكنك إرساله أو حفظه بالخيارات أدناه.",
      deliveredTitle: "تم استلام الطلب",
      deliveredBody: "سيتواصل معك مهندس الحلول لدينا.",
      errorTitle: "لم نتمكن من إرسال الطلب",
      review: "ما سيُرسل",
      copy: "نسخ الطلب",
      copied: "تم النسخ",
      mail: "إرسال بالبريد",
      download: "تنزيل JSON",
      edit: "رجوع إلى النموذج",
      devNote:
        "لربط النظام: أرسل هذه الحمولة إلى endpoint مضبوط عبر VITE_DEMO_ENDPOINT. النموذج يتعامل أصلاً مع حالات النجاح والفشل وإعادة المحاولة.",
      none: "غير مُدخل",
    },
    counter: (n, max) => `${n} / ${max}`,
  },
};
