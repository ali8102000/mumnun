import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isValidPhone, normalizePhone, phoneToEmail } from "@/lib/phone";
import { useAuth } from "@/lib/auth-context";
import { Loader2, Phone, Lock, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

type Mode = "signup" | "login";

function AuthPage() {
  const [mode, setMode] = useState<Mode>("signup");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidPhone(phone)) {
      toast.error("رقم الهاتف غير صالح");
      return;
    }
    if (password.length < 6) {
      toast.error("كلمة المرور يجب أن تكون ٦ أحرف على الأقل");
      return;
    }
    if (mode === "signup" && name.trim().length < 2) {
      toast.error("الرجاء إدخال الاسم");
      return;
    }
    setBusy(true);
    const normalized = normalizePhone(phone);
    const email = phoneToEmail(normalized);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        const uid = data.user?.id;
        if (uid) {
          const { error: pErr } = await supabase.from("profiles").upsert({
            id: uid,
            phone: normalized,
            full_name: name.trim(),
          });
          if (pErr) throw pErr;
        }
        await refresh();
        toast.success("تم إنشاء الحساب");
        navigate({ to: "/select-role" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await refresh();
        toast.success("أهلاً بعودتك");
        navigate({ to: "/" });
      }
    } catch (err: any) {
      const msg = err?.message || "حدث خطأ";
      if (msg.includes("already registered") || msg.includes("User already registered")) {
        toast.error("هذا الرقم مسجل مسبقاً. حاول تسجيل الدخول.");
      } else if (msg.includes("Invalid login")) {
        toast.error("رقم الهاتف أو كلمة المرور غير صحيحة");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col px-5 pt-14 pb-8">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center h-20 w-20 rounded-3xl bg-gradient-to-br from-primary to-primary-glow glow-primary mb-5 shadow-elegant">
          <span className="text-3xl font-black text-primary-foreground">م</span>
        </div>
        <h1 className="text-4xl font-black text-gradient">ممنون</h1>
        <p className="mt-2 text-sm text-muted-foreground">منصة النقل والخدمات الفاخرة</p>
      </div>

      <div className="glass rounded-3xl p-6 shadow-card flex-1 flex flex-col">
        <div className="flex bg-surface-2 rounded-2xl p-1 mb-6">
          {(["signup", "login"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition btn-press tap-highlight-none ${
                mode === m ? "bg-primary text-primary-foreground shadow-card" : "text-muted-foreground"
              }`}
            >
              {m === "signup" ? "حساب جديد" : "تسجيل دخول"}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-4 flex-1 flex flex-col">
          {mode === "signup" && (
            <Field label="الاسم الكامل">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: أحمد محمد"
                className="input-base"
              />
            </Field>
          )}

          <Field label="رقم الهاتف" icon={<Phone className="h-4 w-4" />}>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              dir="ltr"
              placeholder="07XXXXXXXXX"
              inputMode="tel"
              className="input-base text-left"
            />
          </Field>

          <Field label="كلمة المرور" icon={<Lock className="h-4 w-4" />}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              className="input-base"
            />
          </Field>

          <div className="flex-1" />

          <button
            type="submit"
            disabled={busy}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-bold text-base btn-press glow-primary shadow-elegant disabled:opacity-60 tap-highlight-none flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="h-5 w-5 animate-spin" />}
            {mode === "signup" ? "إنشاء الحساب" : "دخول"}
            <ArrowLeft className="h-5 w-5" />
          </button>

          <p className="text-[11px] text-center text-muted-foreground leading-relaxed">
            بمتابعتك أنت توافق على الشروط والأحكام وسياسة الخصوصية.
          </p>
        </form>
      </div>

      <style>{`
        .input-base {
          width: 100%;
          background: var(--color-input);
          border: 1px solid var(--color-border);
          color: var(--color-foreground);
          padding: 14px 16px;
          border-radius: 1rem;
          font-size: 15px;
          font-weight: 600;
          outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .input-base:focus { border-color: var(--color-ring); box-shadow: 0 0 0 4px var(--color-ring); }
        .input-base::placeholder { color: var(--color-muted-foreground); font-weight: 500; }
      `}</style>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="flex items-center gap-2 mb-2 text-xs font-bold text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      {children}
    </label>
  );
}
