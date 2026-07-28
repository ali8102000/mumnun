import { useEffect, type ReactNode } from "react";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { TanStackQueryClientProvider } from "@/integrations/tanstack-query";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "sonner";
import { DriverOfferPopup } from "@/components/driver-offer-popup";
import { appCss } from "@/styles.css?url";

type RouterContext = {
  queryClient: import("@tanstack/react-query").QueryClient;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charset: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" },
      { title: "ممنون" },
      { name: "description", content: "منصة النقل والخدمات الفاخرة — طلب سيارات وخدمات منزلية في مكان واحد" },
      { name: "author", content: "Mumnun" },
      { name: "theme-color", content: "#1e40af" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "ممنون" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "application-name", content: "ممنون" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    if ("serviceWorker" in navigator && window.location.hostname !== "localhost") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <TanStackQueryClientProvider>
      <AuthProvider>
        <Outlet />
        <DriverOfferPopup />
        <Toaster richColors position="top-center" />
      </AuthProvider>
    </TanStackQueryClientProvider>
  );
}
