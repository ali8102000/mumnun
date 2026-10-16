# Architecture
- Keep the welcome flow in a dedicated `/welcome` route with browser-persisted language and completion preferences; this keeps first-visit presentation separate from authentication and preserves returning-user access.
- Language selection applies to welcome and authentication screens; extend translations explicitly when adding other multilingual screens.
- Preserve `/index` as a compatibility redirect to `/` using the `index_` route filename, because the preview can retain that legacy entry URL.