import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/index_")({
  ssr: false,
  head: () => ({ meta: [
    { title: "بدء ممنون" },
    { name: "description", content: "الانتقال إلى بداية تطبيق ممنون للنقل والخدمات." },
    { property: "og:title", content: "بدء ممنون" },
    { property: "og:description", content: "الانتقال إلى بداية تطبيق ممنون للنقل والخدمات." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <Navigate to="/" replace />,
});