import { useEffect, useState, type ChangeEvent } from "react";
import { Box, Upload, Save, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

type ModelKey = "taxi" | "cargo_van" | "passenger_van" | "bus" | "worker" | "customer";
type ModelEntry = { url: string; fileName: string };
type ModelSettings = Record<ModelKey, ModelEntry>;
type SettingsRecord = Record<string, Json>;

const MODEL_ITEMS: { key: ModelKey; title: string; description: string }[] = [
  { key: "taxi", title: "سيارة تكسي", description: "سيارات الأجرة الاعتيادية" },
  { key: "cargo_van", title: "كيّة حمل", description: "مركبات نقل البضائع والحمولات" },
  { key: "passenger_van", title: "كيّة ركاب", description: "مركبات نقل الركاب" },
  { key: "bus", title: "باص", description: "الحافلات" },
  { key: "worker", title: "فني / عامل", description: "مقدمو الخدمات المنزلية والمهنية" },
  { key: "customer", title: "زبون", description: "مؤشر موقع الزبون عند الحاجة" },
];
const DEFAULT_MODELS: ModelSettings = {
  taxi: { url: "https://tevy.dev/models/city-taxi/v1/lod2.glb", fileName: "City Taxi (CC0)" },
  cargo_van: { url: "https://tevy.dev/models/delivery-van/v1/lod2.glb", fileName: "High-Roof Delivery Van (CC0)" },
  passenger_van: { url: "https://tevy.dev/models/kei-van/v1/lod2.glb", fileName: "Kei Van (CC0)" },
  bus: { url: "https://tevy.dev/models/city-bus/v1/lod2.glb", fileName: "Low-Floor City Bus (CC0)" },
  worker: { url: "https://tevy.dev/models/road-worker/v1/lod2.glb", fileName: "Road Worker (CC0)" },
  customer: { url: "", fileName: "" },
};

function readModels(value: Json | null | undefined): ModelSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_MODELS;
  const raw = value as SettingsRecord;
  const candidate = raw.mapModels;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return DEFAULT_MODELS;
  const source = candidate as Record<string, Json>;
  return Object.fromEntries(MODEL_ITEMS.map(({ key }) => {
    const item = source[key];
    if (!item || typeof item !== "object" || Array.isArray(item)) return [key, DEFAULT_MODELS[key]];
    const row = item as Record<string, Json>;
    return [key, { url: typeof row.url === "string" ? row.url : "", fileName: typeof row.fileName === "string" ? row.fileName : "" }];
  })) as ModelSettings;
}

export function Map3DModelsSection() {
  const [models, setModels] = useState<ModelSettings>(DEFAULT_MODELS);
  const [baseSettings, setBaseSettings] = useState<SettingsRecord>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<ModelKey | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await supabase.from("app_editor_settings").select("settings").eq("id", "global").maybeSingle();
      if (!active) return;
      if (error) toast.error("تعذّر تحميل إعدادات المجسّمات");
      else {
        const raw = data?.settings && typeof data.settings === "object" && !Array.isArray(data.settings) ? data.settings as SettingsRecord : {};
        setBaseSettings(raw);
        setModels(readModels(data?.settings));
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const uploadModel = async (key: ModelKey, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".glb") || file.size < 12 || file.size > 20 * 1024 * 1024) {
      toast.error("اختر ملف GLB صالحاً بحجم لا يتجاوز 20 ميغابايت");
      return;
    }
    const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (signature[0] !== 0x67 || signature[1] !== 0x6c || signature[2] !== 0x54 || signature[3] !== 0x46) {
      toast.error("الملف المحدد ليس ملف GLB صحيحاً");
      return;
    }
    setUploading(key);
    try {
      const path = `map-models/${key}/${Date.now()}-${crypto.randomUUID()}.glb`;
      const { error } = await supabase.storage.from("map-3d-models").upload(path, file, { upsert: false, contentType: "model/gltf-binary" });
      if (error) throw error;
      const { data } = supabase.storage.from("map-3d-models").getPublicUrl(path);
      setModels((current) => ({ ...current, [key]: { url: data.publicUrl, fileName: file.name } }));
      toast.success("تم رفع المجسّم. اضغط حفظ لتثبيت الربط");
    } catch (error) {
      console.error("[map-3d-models] upload failed", error);
      toast.error("فشل رفع المجسّم. تأكد من صلاحية المدير الأعلى");
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("انتهت جلسة الدخول");
      const settings = { ...baseSettings, mapModels: models } as unknown as Json;
      const { error } = await supabase.from("app_editor_settings").upsert({
        id: "global", settings, updated_at: new Date().toISOString(), updated_by: userData.user.id,
      });
      if (error) throw error;
      setBaseSettings((current) => ({ ...current, mapModels: models as unknown as Json }));
      toast.success("تم حفظ ربط مجسّمات الخريطة");
    } catch (error) {
      console.error("[map-3d-models] save failed", error);
      toast.error("تعذّر حفظ الإعدادات. تحقق من صلاحية المدير الأعلى");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="grid place-items-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;

  return (
    <section dir="rtl" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">مجسّمات الخريطة 3D</h2>
          <p className="mt-1 text-sm text-muted-foreground">ارفع ملف GLB لكل فئة واربطه بها. هذا القسم يحفظ الأصول والإعدادات ولا يغيّر نظام GPS أو التوفر.</p>
        </div>
        <button onClick={() => void save()} disabled={saving || uploading !== null} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} حفظ الربط
        </button>
      </div>
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <strong className="text-foreground">ملاحظة:</strong> ارفع مجسّمات GLB بخلفية شفافة ومن دون قاعدة أو دائرة. ربط الملف هنا لا يعني أن عرضه على الخريطة أصبح مفعّلاً بعد.
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {MODEL_ITEMS.map((item) => {
          const model = models[item.key];
          return (
            <article key={item.key} className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Box className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-black">{item.title}</h3>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
              </div>
              <div className="rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm">
                {model.url ? <div className="space-y-2"><p className="break-all font-semibold">{model.fileName || "مجسّم مرتبط"}</p><a href={model.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline"><ExternalLink className="h-3 w-3" /> فتح ملف GLB</a></div> : <p className="text-muted-foreground">لم يتم ربط مجسّم لهذه الفئة</p>}
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-bold hover:bg-muted">
                {uploading === item.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {model.url ? "استبدال المجسّم" : "رفع مجسّم GLB"}
                <input type="file" accept=".glb,model/gltf-binary" className="hidden" disabled={uploading !== null} onChange={(event) => void uploadModel(item.key, event)} />
              </label>
              <label className="block text-xs font-bold">رابط GLB خارجي (اختياري)
                <input value={model.url} onChange={(event) => setModels((current) => ({ ...current, [item.key]: { ...current[item.key], url: event.target.value, fileName: current[item.key].fileName } }))} placeholder="https://..." dir="ltr" className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal" />
              </label>
            </article>
          );
        })}
      </div>
    </section>
  );
}
