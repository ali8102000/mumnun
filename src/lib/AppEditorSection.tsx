import { useCallback, useEffect, useState } from "react";
import { ImagePlus, Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Category = { category_key:string; vertical:string; title:string; image_url:string|null; is_active:boolean; sort_order:number; tile_width_px:number; tile_height_px:number; auto_scroll_seconds:number };
type Element = { element_key:string; label:string; title:string; image_url:string|null; width_px:number; height_px:number; config:Record<string,unknown>; is_enabled:boolean };
type Banner = { id:string; image_url:string; storage_path:string|null; is_active:boolean; scroll_speed:number; display_order:number };

export default function AppEditorSection() {
 const [tab,setTab]=useState("categories");
 const [categories,setCategories]=useState<Category[]>([]);
 const [vehicles,setVehicles]=useState<Element[]>([]);
 const [banners,setBanners]=useState<Banner[]>([]);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState("");
 const [message,setMessage]=useState("");
 const db=supabase as any;
 const load=useCallback(async()=>{
  setLoading(true); setMessage("");
  try {
   const [c,v,b]=await Promise.all([
    db.from("partner_catalog_categories").select("*").order("sort_order"),
    db.from("app_ui_elements").select("*").eq("placement_key","request.taxi.vehicle_types").order("sort_order"),
    db.from("home_carousel_banners").select("*").eq("target_category","worker").order("display_order")
   ]);
   if(c.error) throw c.error; if(v.error) throw v.error; if(b.error) throw b.error;
   setCategories(c.data||[]); setVehicles(v.data||[]); setBanners(b.data||[]);
  } catch(e) { console.error(e); setMessage("تعذر تحميل إعدادات المحرر. تأكد من صلاحية المدير الأعلى."); }
  finally { setLoading(false); }
 },[]);
 useEffect(()=>{void load();},[load]);
 async function upload(file:File,folder:string) {
  if(!file.type.startsWith("image/")) throw new Error("اختَر صورة فقط");
  if(file.size>8*1024*1024) throw new Error("حجم الصورة يجب ألا يتجاوز 8 ميغابايت");
  const name=file.name.replace(/[^a-zA-Z0-9._-]/g,"-");
  const path="app-editor/"+folder+"/"+Date.now()+"-"+name;
  const result=await supabase.storage.from("app-visuals").upload(path,file,{upsert:false,contentType:file.type});
  if(result.error) throw result.error;
  return {path,url:supabase.storage.from("app-visuals").getPublicUrl(path).data.publicUrl};
 }
 async function saveCategory(item:Category,file?:File) {
  setBusy(item.category_key);
  try {
   const uploaded=file?await upload(file,"categories/"+item.vertical):null;
   const {error}=await db.from("partner_catalog_categories").update({
    title:item.title,image_url:uploaded?.url||item.image_url,is_active:item.is_active,sort_order:item.sort_order,
    tile_width_px:item.tile_width_px,tile_height_px:item.tile_height_px,auto_scroll_seconds:item.auto_scroll_seconds,updated_at:new Date().toISOString()
   }).eq("category_key",item.category_key);
   if(error) throw error; setMessage("تم حفظ الفئة: "+item.title); await load();
  } catch(e) {setMessage(e instanceof Error?e.message:"تعذر حفظ الفئة");}
  finally {setBusy("");}
 }
 async function saveVehicle(item:Element,file?:File) {
  setBusy(item.element_key);
  try {
   const uploaded=file?await upload(file,"vehicles/"+item.element_key):null;
   const image=uploaded?.url||item.image_url;
   const config={...(item.config||{}),image_url:image,width_px:item.width_px,height_px:item.height_px};
   const {error}=await db.from("app_ui_elements").update({image_url:image,width_px:item.width_px,height_px:item.height_px,config,published_config:config,is_published:true,is_enabled:item.is_enabled,updated_at:new Date().toISOString()}).eq("element_key",item.element_key);
   if(error) throw error; setMessage("تم حفظ صورة "+item.label); await load();
  } catch(e) {setMessage(e instanceof Error?e.message:"تعذر حفظ الصورة");}
  finally {setBusy("");}
 }
 async function saveBanner(item:Banner,file?:File) {
  setBusy(item.id);
  try {
   const uploaded=file?await upload(file,"worker-panorama"):null;
   const {error}=await db.from("home_carousel_banners").update({image_url:uploaded?.url||item.image_url,storage_path:uploaded?.path||item.storage_path,is_active:item.is_active,scroll_speed:item.scroll_speed,display_order:item.display_order,updated_at:new Date().toISOString()}).eq("id",item.id);
   if(error) throw error; setMessage("تم حفظ البانوراما"); await load();
  } catch(e) {setMessage(e instanceof Error?e.message:"تعذر حفظ البانوراما");}
  finally {setBusy("");}
 }
 async function addBanner(file:File) {
  setBusy("new");
  try {
   const uploaded=await upload(file,"worker-panorama");
   const {error}=await db.from("home_carousel_banners").insert({image_url:uploaded.url,storage_path:uploaded.path,target_category:"worker",is_active:true,scroll_speed:3,display_order:banners.length,banner_type:"category"});
   if(error) throw error; setMessage("تمت إضافة صورة بانوراما الفنيين"); await load();
  } catch(e) {setMessage(e instanceof Error?e.message:"تعذر رفع الصورة");}
  finally {setBusy("");}
 }
 async function deleteBanner(item:Banner) {
  if(!window.confirm("تأكيد حذف صورة البانوراما؟")) return;
  setBusy(item.id);
  try {const {error}=await db.from("home_carousel_banners").delete().eq("id",item.id);if(error)throw error;await load();setMessage("تم حذف الصورة");}
  catch(e){setMessage(e instanceof Error?e.message:"تعذر الحذف");}finally{setBusy("");}
 }
 const patchCategory=(key:string,p:Partial<Category>)=>setCategories(rows=>rows.map(x=>x.category_key===key?{...x,...p}:x));
 const patchVehicle=(key:string,p:Partial<Element>)=>setVehicles(rows=>rows.map(x=>x.element_key===key?{...x,...p}:x));
 const patchBanner=(key:string,p:Partial<Banner>)=>setBanners(rows=>rows.map(x=>x.id===key?{...x,...p}:x));
 return <div className="space-y-4" dir="rtl">
  <div><h2 className="text-xl font-black">محرر التطبيقات</h2><p className="text-xs text-muted-foreground mt-1">التحكم بصور الفئات وأحجامها وسرعة عرضها وصور السيارات وبانوراما الفنيين</p></div>
  <div className="flex flex-wrap gap-2">
   <button onClick={()=>setTab("categories")} className={tab==="categories"?"rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-bold":"rounded-xl glass px-4 py-2 text-xs font-bold"}>فئات المتاجر والمطاعم</button>
   <button onClick={()=>setTab("vehicles")} className={tab==="vehicles"?"rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-bold":"rounded-xl glass px-4 py-2 text-xs font-bold"}>اقتصادي ومتميز وفاخر</button>
   <button onClick={()=>setTab("panorama")} className={tab==="panorama"?"rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-bold":"rounded-xl glass px-4 py-2 text-xs font-bold"}>بانوراما الفنيين</button>
  </div>
  {message&&<div className="glass rounded-xl p-3 text-sm font-bold">{message}</div>}
  {loading?<Loader2 className="h-7 w-7 animate-spin mx-auto"/>:<>
   {tab==="categories"&&<div className="space-y-3">{categories.map(item=><CategoryCard key={item.category_key} item={item} busy={busy===item.category_key} change={p=>patchCategory(item.category_key,p)} save={f=>saveCategory(item,f)}/>)}</div>}
   {tab==="vehicles"&&<div className="space-y-3">{vehicles.map(item=><VehicleCard key={item.element_key} item={item} busy={busy===item.element_key} change={p=>patchVehicle(item.element_key,p)} save={f=>saveVehicle(item,f)}/>)}</div>}
   {tab==="panorama"&&<div className="space-y-3">
    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/50 p-5 text-sm font-bold text-primary"><ImagePlus/> إضافة صورة بانوراما<input type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)void addBanner(f);e.currentTarget.value="";}}/></label>
    {banners.map(item=><BannerCard key={item.id} item={item} busy={busy===item.id} change={p=>patchBanner(item.id,p)} save={f=>saveBanner(item,f)} remove={()=>deleteBanner(item)}/>)}
    {!banners.length&&<p className="text-sm text-muted-foreground text-center p-5">لا توجد صور بانوراما للفنيين حالياً</p>}
   </div>}
  </>}
 </div>;
}

function CategoryCard({item,busy,change,save}:{item:Category;busy:boolean;change:(p:Partial<Category>)=>void;save:(f?:File)=>void}) {
 const [file,setFile]=useState<File>();
 return <div className="glass rounded-2xl p-4 space-y-3">
  <div className="flex items-center gap-3"><img src={item.image_url||""} alt={item.title} className="w-20 h-20 rounded-xl object-cover bg-surface-2"/><div><b>{item.title}</b><div className="text-[11px] text-muted-foreground">{item.vertical==="restaurant"?"مطاعم":item.vertical==="store"?"متاجر":"بقالة"}</div><label className="text-xs text-primary font-bold cursor-pointer"><Upload className="inline w-3 h-3"/> تغيير الصورة<input type="file" accept="image/*" className="hidden" onChange={e=>setFile(e.target.files?.[0])}/></label></div></div>
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
   <label className="text-[11px]">اسم الفئة<input value={item.title} onChange={e=>change({title:e.target.value})} className="mt-1 w-full rounded-lg glass p-2"/></label>
   <label className="text-[11px]">العرض<input type="number" min="32" max="240" value={item.tile_width_px} onChange={e=>change({tile_width_px:Number(e.target.value)})} className="mt-1 w-full rounded-lg glass p-2"/></label>
   <label className="text-[11px]">الارتفاع<input type="number" min="32" max="240" value={item.tile_height_px} onChange={e=>change({tile_height_px:Number(e.target.value)})} className="mt-1 w-full rounded-lg glass p-2"/></label>
   <label className="text-[11px]">سرعة الحركة بالثواني<input type="number" min="1" max="60" value={item.auto_scroll_seconds} onChange={e=>change({auto_scroll_seconds:Number(e.target.value)})} className="mt-1 w-full rounded-lg glass p-2"/></label>
  </div>
  <div className="flex justify-between items-center"><label className="text-xs"><input type="checkbox" checked={item.is_active} onChange={e=>change({is_active:e.target.checked})}/> مفعّلة</label><button disabled={busy} onClick={()=>save(file)} className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-bold disabled:opacity-50">{busy?"جارٍ الحفظ":"حفظ الفئة"}</button></div>
 </div>;
}
function VehicleCard({item,busy,change,save}:{item:Element;busy:boolean;change:(p:Partial<Element>)=>void;save:(f?:File)=>void}) {
 const [file,setFile]=useState<File>();
 return <div className="glass rounded-2xl p-4 flex flex-wrap gap-3 items-center"><img src={item.image_url||""} alt={item.label} className="w-20 h-20 rounded-xl object-contain bg-surface-2"/><div className="flex-1 min-w-[150px]"><b className="text-sm">{item.label}</b><div className="text-xs text-muted-foreground">{item.title}</div><label className="text-xs text-primary font-bold cursor-pointer"><Upload className="inline w-3 h-3"/> تغيير الصورة<input type="file" accept="image/*" className="hidden" onChange={e=>setFile(e.target.files?.[0])}/></label></div><label className="text-[10px]">العرض<input type="number" min="32" max="240" value={item.width_px} onChange={e=>change({width_px:Number(e.target.value)})} className="block w-20 glass rounded-lg p-2"/></label><label className="text-[10px]">الارتفاع<input type="number" min="32" max="240" value={item.height_px} onChange={e=>change({height_px:Number(e.target.value)})} className="block w-20 glass rounded-lg p-2"/></label><button disabled={busy} onClick={()=>save(file)} className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-bold">حفظ الصورة</button></div>;
}
function BannerCard({item,busy,change,save,remove}:{item:Banner;busy:boolean;change:(p:Partial<Banner>)=>void;save:(f?:File)=>void;remove:()=>void}) {
 const [file,setFile]=useState<File>();
 return <div className="glass rounded-2xl p-4 space-y-3"><div className="flex items-center gap-3"><img src={item.image_url} alt="بانوراما الفنيين" className="w-28 h-20 rounded-xl object-cover"/><label className="text-xs text-primary font-bold cursor-pointer">تغيير الصورة<input type="file" accept="image/*" className="hidden" onChange={e=>setFile(e.target.files?.[0])}/></label></div><div className="flex flex-wrap gap-3"><label className="text-[11px]">سرعة الحركة<input type="number" min="1" max="60" value={item.scroll_speed} onChange={e=>change({scroll_speed:Number(e.target.value)})} className="block w-24 glass rounded-lg p-2"/></label><label className="text-[11px]">الترتيب<input type="number" min="0" value={item.display_order} onChange={e=>change({display_order:Number(e.target.value)})} className="block w-24 glass rounded-lg p-2"/></label><label className="text-xs mt-5"><input type="checkbox" checked={item.is_active} onChange={e=>change({is_active:e.target.checked})}/> مفعّلة</label></div><div className="flex justify-between"><button onClick={remove} className="text-xs text-red-600 font-bold">حذف</button><button disabled={busy} onClick={()=>save(file)} className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-bold">حفظ</button></div></div>;
}
