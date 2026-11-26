import { useEffect, useRef, useState } from 'react';
import type { ComponentType, Ref } from 'react';
import { StyleSheet } from 'react-native';
import { WebView as NativeWebView, type WebViewProps, type WebViewMessageEvent } from 'react-native-webview';

// react-native-webview 14.0.1 has a published generic default-type bug (P=undefined).
type NativeWebViewInstance = InstanceType<typeof NativeWebView>;
const WebView = NativeWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<NativeWebViewInstance | null> }>;

export type ProjectedMapModelPin = {
  id: string;
  x: number;
  y: number;
  heading: number;
  url: string;
  label: string;
};

const MODEL_VIEWER_HTML = `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <style>
    html, body, #root { width:100%; height:100%; margin:0; padding:0; overflow:hidden; background:transparent !important; }
    .pin { position:absolute; width:76px; height:76px; transform:translate(-50%,-82%); pointer-events:none; }
    .shadow { position:absolute; left:18%; right:18%; bottom:4px; height:10px; border-radius:50%; background:radial-gradient(ellipse,rgba(15,23,42,.28) 0%,rgba(15,23,42,0) 75%); filter:blur(2px); }
    model-viewer { position:absolute; inset:0; width:100%; height:100%; background:transparent; --poster-color:transparent; pointer-events:none; }
  </style>
  <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js"></script>
</head>
<body>
  <div id="root"></div>
  <script>
    (function () {
      const root = document.getElementById('root');
      const nodes = new Map();
      function report(type, id) {
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, id: id }));
      }
      window.setMapModels = function (items) {
        const seen = new Set();
        (items || []).forEach(function (item) {
          if (!item || !item.id || !item.url || !(item.url.indexOf('https://') === 0 || item.url.indexOf('http://') === 0)) return;
          seen.add(item.id);
          let entry = nodes.get(item.id);
          if (!entry) {
            const wrapper = document.createElement('div');
            wrapper.className = 'pin';
            const shadow = document.createElement('div');
            shadow.className = 'shadow';
            const viewer = document.createElement('model-viewer');
            viewer.setAttribute('alt', item.label || 'مؤشر موقع متاح');
            viewer.setAttribute('camera-orbit', '0deg 72deg 110%');
            viewer.setAttribute('camera-target', 'auto auto auto');
            viewer.setAttribute('shadow-intensity', '0.75');
            viewer.setAttribute('exposure', '1.1');
            viewer.setAttribute('interaction-prompt', 'none');
            viewer.setAttribute('disable-zoom', '');
            viewer.addEventListener('load', function () { report('loaded', item.id); });
            viewer.addEventListener('error', function () { report('error', item.id); });
            wrapper.appendChild(shadow);
            wrapper.appendChild(viewer);
            root.appendChild(wrapper);
            entry = { wrapper: wrapper, viewer: viewer, url: '' };
            nodes.set(item.id, entry);
          }
          entry.wrapper.style.left = item.x + 'px';
          entry.wrapper.style.top = item.y + 'px';
          entry.viewer.setAttribute('orientation', '0deg 0deg ' + (Number(item.heading) || 0) + 'deg');
          if (entry.url !== item.url) {
            if (entry.url) report('loading', item.id);
            entry.url = item.url;
            entry.viewer.setAttribute('src', item.url);
          }
        });
        nodes.forEach(function (entry, id) {
          if (!seen.has(id)) {
            entry.viewer.remove();
            entry.wrapper.remove();
            nodes.delete(id);
          }
        });
      };
    })();
  </script>
</body>
</html>`;

export function Map3DModelOverlay({
  pins,
  onModelStateChange,
}: {
  pins: ProjectedMapModelPin[];
  onModelStateChange: (id: string, loaded: boolean) => void;
}) {
  const webViewRef = useRef<NativeWebViewInstance | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const payload = JSON.stringify(pins).replace(/</g, '\\u003c');
    webViewRef.current?.injectJavaScript(`window.setMapModels && window.setMapModels(${payload}); true;`);
  }, [pins, ready]);

  return (
    <WebView
      ref={webViewRef}
      source={{ html: MODEL_VIEWER_HTML, baseUrl: 'https://mamnoon.app/' }}
      style={styles.overlay}
      containerStyle={styles.container}
      pointerEvents="none"
      javaScriptEnabled
      domStorageEnabled={false}
      scrollEnabled={false}
      bounces={false}
      originWhitelist={['https://*', 'http://*']}
      onLoadEnd={() => setReady(true)}
      onMessage={(event: WebViewMessageEvent) => {
        try {
          const message = JSON.parse(event.nativeEvent.data) as { type?: string; id?: string };
          if (message.id && (message.type === 'loaded' || message.type === 'error' || message.type === 'loading')) {
            onModelStateChange(message.id, message.type === 'loaded');
          }
        } catch {
          // Ignore malformed messages from the renderer.
        }
      }}
      onError={() => setReady(false)}
      androidLayerType="hardware"
      allowsInlineMediaPlayback
    />
  );
}

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFill, backgroundColor: 'transparent' },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'transparent' },
});
