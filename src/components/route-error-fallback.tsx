import { AlertTriangle, RefreshCw } from "lucide-react";

export function RouteErrorFallback({
  error,
  reset,
}: {
  error: unknown;
  reset: () => void;
}) {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "حدث خطأ غير متوقع أثناء تحميل الشاشة.";

  return (
    <main
      role="alert"
      dir="rtl"
      className="min-h-[55vh] grid place-items-center px-5 py-10 text-center"
    >
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-black">تعذّر تحميل هذه الشاشة</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {message || "تحقق من اتصال الإنترنت ثم حاول مرة أخرى."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 font-bold text-primary-foreground btn-press"
        >
          <RefreshCw className="h-4 w-4" />
          إعادة المحاولة
        </button>
      </div>
    </main>
  );
}
