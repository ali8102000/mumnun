import { useEffect, useState, type ChangeEvent } from "react";
import { ImagePlus, Save, RefreshCw, Loader2, Upload, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

type ImageSetting = { url: string; scale: number; x: number; y: number };
type EditorSettings = { version: number; images: Record<string, ImageSetting> };

const IMAGE_ITEMS = [
  { key: "storeCategory", title: "فئة المتاجر", group: "فئات المتاجر والمطاعم" },
  { key: "restaurantCategory", title: "فئة المطاعم", group: "فئات المتاجر والمطاعم" },
  { key: "vehicleEconomy", title: "اقتصادي", group: "تصنيفات المركبات" },
  { key: "vehiclePremium", title: "متميز", group: "تصنيفات المركبات" },
  { key: "vehicleLuxury", title: "فاخر", group: "تصنيفات المركبات" },
  { key: "providerBanner", title: "بانوراما الفنيين", group: "بانوراما الفنيين" },
] as const;

const DEFAULT_SETTINGS: EditorSettings = {
  version: 1,
  images: Object.fromEntries(IMAGE_ITEMS.map(({ key }) => [key, { url: "", scale: 1, x: 50, y: 50 }])) as Record<string, ImageSetting>,
};

function normalizeSettings(value: Json | null | undefined): EditorSettings {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Json> : {};
  const rawImages = raw.images && typeof raw.images === "object" && !Array.isArray(raw.images) ? raw.images as Record<string, Json> : {};
  const images = { ...DEFAULT_SETTINGS.images };
  for (const { key } of IMAGE_ITEMS) {
    const candidate = rawImages[key];
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const item = candidate as Record<string, Json>;
      images[key] = {
        url: typeof item.url === "string" ? item.url : "",
        scale: typeof item.scale === "number" ? Math.min(3, Math.max(1, item.scale)) : 1,
        x: typeof item.x === "number" ? Math.min(100, Math.max(0, item.x)) : 50,
        y: typeof item.y === "number" ? Math.min(100, Math.max(0, item.y)) : 50,
      };
    }
  }
  return { version: 1, images };
}

export function AppEditorSection() {
  const [settings, setSettings] = useState<EditorSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.from("app_editor_settings").select("settings").eq("id", "global").maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) toast.error("تعذّر تحميل إعدادات محرر التطبيقات");
        else if (data?.settings) setSettings(normalizeSettings(data.settings));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const patchImage = (key: string, patch: Partial<ImageSetting>) => {
    setSettings((current) => ({ ...current, images: { ...current.images, [key]: { ...current.images[key], ...patch } } }));
  };

  const uploadImage = async (key: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("اختر صورة JPG أو PNG أو WebP");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("حجم الصورة يجب ألا يتجاوز 10 ميغابايت");
      return;
    }
    setUploading(key);
    try {
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${key}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("app-editor-media").upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("app-editor-media").getPublicUrl(path);
      patchImage(key, { url: data.publicUrl });
      toast.success("تم رفع الصورة، اضغط حفظ لتعميمها");
    } catch (error) {
      console.error("[app-editor] upload failed", error);
      toast.error("فشل رفع الصورة. تأكد من تطبيق ترحيل قاعدة البيانات والصلاحيات");
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("انتهت جلسة الدخول");
      const { error } = await supabase.from("app_editor_settings").upsert({
        id: "global",
        settings: settings as unknown as Json,
        updated_at: new Date().toISOString(),
        updated_by: userData.user.id,
      });
      if (error) throw error;
      toast.success("تم حفظ إعدادات محرر التطبيقات");
    } catch (error) {
      console.error("[app-editor] save failed", error);
      toast.error("تعذّر الحفظ. هذه العملية تتطلب صلاحية المدير الأعلى");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="grid place-items-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;

  const groups = [...new Set(IMAGE_ITEMS.map((item) => item.group))];
  return (
    <section dir="rtl" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">محرر التطبيقات</h2>
          <p className="mt-1 text-sm text-muted-foreground">تحكم بصور الفئات وتصنيفات المركبات وبانوراما الفنيين من مكان واحد</p>
        </div>
        <button onClick={() => void save()} disabled={saving || uploading !== null} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} حفظ التغييرات
        </button>
      </div>

      {groups.map((group) => (
        <div key={group} className="space-y-3">
          <h3 className="text-base font-black">{group}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {IMAGE_ITEMS.filter((item) => item.group === group).map((item) => {
              const image = settings.images[item.key] ?? { url: "", scale: 1, x: 50, y: 50 };
              return (
                <article key={item.key} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-bold">{item.title}</h4>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-bold hover:bg-muted">
                      {uploading === item.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      رفع صورة
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploading !== null} onChange={(event) => void uploadImage(item.key, event)} />
                    </label>
                  </div>
                  <div className="relative h-44 overflow-hidden rounded-xl bg-muted">
                    {image.url ? <img src={image.url} alt={item.title} className="h-full w-full object-cover" style={{ objectPosition: `${image.x}% ${image.y}%`, transform: `scale(${image.scale})` }} /> : <div className="grid h-full place-items-center text-sm text-muted-foreground"><ImagePlus className="mb-2 h-8 w-8" />لا توجد صورة مضافة</div>}
                  </div>
                  <div className="space-y-3">
                    <label className="block text-xs font-bold">رابط الصورة (اختياري)</label>
                    <input value={image.url} onChange={(event) => patchImage(item.key, { url: event.target.value })} placeholder="https://..." dir="ltr" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <label className="text-xs font-semibold">التكبير: {image.scale.toFixed(1)}×<input type="range" min="1" max="3" step="0.1" value={image.scale} onChange={(event) => patchImage(item.key, { scale: Number(event.target.value) })} className="mt-2 block w-full" /></label>
                      <label className="text-xs font-semibold">الموضع الأفقي: {image.x}%<input type="range" min="0" max="100" value={image.x} onChange={(event) => patchImage(item.key, { x: Number(event.target.value) })} className="mt-2 block w-full" /></label>
                      <label className="text-xs font-semibold">الموضع العمودي: {image.y}%<input type="range" min="0" max="100" value={image.y} onChange={(event) => patchImage(item.key, { y: Number(event.target.value) })} className="mt-2 block w-full" /></label>
                    </div>
                    <button type="button" onClick={() => patchImage(item.key, { scale: 1, x: 50, y: 50 })} className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground"><RotateCcw className="h-3 w-3" /> إعادة ضبط القص</button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex justify-end">
        <button onClick={() => void save()} disabled={saving || uploading !== null} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} حفظ ونشر الإعدادات
        </button>
      </div>
    </section>
  );
}
