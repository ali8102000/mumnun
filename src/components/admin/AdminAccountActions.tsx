import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { adminCreateUserInvite, adminUpdateUserContact } from "@/lib/admin.functions";

type Props = { userId: string; email?: string | null; phone?: string | null; canManage: boolean };

export function AdminAccountActions({ userId, email, phone, canManage }: Props) {
  const [open, setOpen] = useState(false);
  const [nextEmail, setNextEmail] = useState(email ?? "");
  const [nextPhone, setNextPhone] = useState(phone ?? "");
  const [busy, setBusy] = useState(false);
  const updateContact = useServerFn(adminUpdateUserContact);
  if (!canManage) return null;
  async function save() {
    if (!nextEmail.trim() && !nextPhone.trim()) { window.alert("أدخل البريد أو الهاتف"); return; }
    setBusy(true);
    try {
      const result = await updateContact({ data: {
        user_id: userId,
        ...(nextEmail.trim() !== (email ?? "") ? { email: nextEmail.trim() || null } : {}),
        ...(nextPhone.trim() !== (phone ?? "") ? { phone: nextPhone.trim() || null } : {}),
      } });
      if (!result.audit_logged) window.alert("تم التحديث لكن تعذر تسجيل العملية في سجل الإدارة.");
      setOpen(false);
      window.location.reload();
    } catch (error) { window.alert(error instanceof Error ? error.message : "تعذر تحديث الحساب"); }
    finally { setBusy(false); }
  }
  return <>
    <button onClick={() => setOpen(true)} className="text-xs px-3 py-1.5 rounded-lg bg-sky-100 text-sky-800 font-bold">تعديل بيانات الدخول</button>
    {open && <div className="fixed inset-0 z-[60] bg-black/50 grid place-items-center p-4">
      <div className="glass rounded-2xl p-5 w-full max-w-md space-y-3">
        <div className="font-black">تعديل البريد ورقم الهاتف</div>
        <label className="block text-xs font-bold">البريد الإلكتروني</label>
        <input type="email" value={nextEmail} onChange={e => setNextEmail(e.target.value)} className="w-full glass rounded-xl px-3 py-2 text-sm" />
        <label className="block text-xs font-bold">رقم الهاتف</label>
        <input value={nextPhone} onChange={e => setNextPhone(e.target.value)} className="w-full glass rounded-xl px-3 py-2 text-sm" />
        <p className="text-xs text-muted-foreground">قد تتطلب تغييرات البريد أو الهاتف التحقق من العنوان الجديد حسب إعدادات المصادقة.</p>
        <div className="flex gap-2"><button disabled={busy} onClick={save} className="flex-1 rounded-xl bg-primary text-primary-foreground py-2 text-sm font-bold">{busy ? "جارٍ الحفظ..." : "حفظ"}</button><button onClick={() => setOpen(false)} className="rounded-xl glass px-4 py-2 text-sm">إلغاء</button></div>
      </div>
    </div>}
  </>;
}

export function AdminCreateAccount() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const sendInvite = useServerFn(adminCreateUserInvite);
  async function submit() {
    setBusy(true);
    try {
      const result = await sendInvite({ data: { email, full_name: name, ...(phone.trim() ? { phone: phone.trim() } : {}) } });
      window.alert(result.audit_logged ? "تم إنشاء الحساب وإرسال دعوة التفعيل إلى البريد." : "تم إرسال الدعوة لكن تعذر تسجيل العملية في سجل الإدارة.");
      setEmail(""); setName(""); setPhone("");
    } catch (error) { window.alert(error instanceof Error ? error.message : "تعذر إنشاء الحساب"); }
    finally { setBusy(false); }
  }
  return <div className="glass rounded-2xl p-4 mb-4 space-y-2">
    <div className="font-black text-sm">إنشاء حساب وإرسال دعوة</div>
    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="الاسم الكامل" className="w-full glass rounded-xl px-3 py-2 text-sm" />
    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="البريد الإلكتروني" className="w-full glass rounded-xl px-3 py-2 text-sm" />
    <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="رقم الهاتف (اختياري)" className="w-full glass rounded-xl px-3 py-2 text-sm" />
    <button disabled={busy || !name.trim() || !email.trim()} onClick={submit} className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-bold disabled:opacity-50">{busy ? "جارٍ إرسال الدعوة..." : "إنشاء الحساب وإرسال الدعوة"}</button>
    <p className="text-[11px] text-muted-foreground">إنشاء الحساب حالياً بدعوة بريد إلكتروني؛ لا يتم عرض كلمات مرور مؤقتة أو تخزينها في الواجهة.</p>
  </div>;
}
