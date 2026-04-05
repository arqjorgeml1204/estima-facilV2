/**
 * PdfWebViewBridge.tsx
 *
 * A hidden WebView component that runs pdfjs-dist inside the browser engine,
 * bypassing Hermes JS engine restrictions that prevent pdfjs from initializing.
 *
 * Usage:
 *   const bridgeRef = useRef<PdfBridgeRef>(null);
 *   <PdfWebViewBridge ref={bridgeRef} />
 *   const lines = await bridgeRef.current!.extractText(base64Pdf);
 */

import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useCallback,
} from 'react';
import { StyleSheet } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';

// ── Public interface exposed via ref ─────────────────────────────────────────

export interface PdfBridgeRef {
  /**
   * Sends the PDF (as a base64 string) to the WebView for text extraction.
   * Resolves with an array of text lines in document order.
   * Rejects if pdfjs reports an error or if the 30-second timeout expires.
   */
  extractText(base64Pdf: string): Promise<string[]>;
}

// ── Internal pending-promise registry ────────────────────────────────────────

interface PendingEntry {
  resolve: (lines: string[]) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ── HTML source (inline string avoids Expo asset-uri resolution issues) ──────

const EXTRACTOR_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PDF Extractor Bridge</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"><\/script>
</head>
<body>
<script>
(function () {
  'use strict';

  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
  }

  function base64ToUint8Array(base64) {
    var binStr = '';
    try {
      binStr = atob(base64);
    } catch (e) {
      var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      var lookup = new Uint8Array(256);
      for (var i = 0; i < B64.length; i++) lookup[B64.charCodeAt(i)] = i;
      var len = base64.length;
      var bufLen = (len * 3) >> 2;
      if (base64[len - 1] === '=') bufLen--;
      if (base64[len - 2] === '=') bufLen--;
      var bytes = new Uint8Array(bufLen);
      var p = 0;
      for (var j = 0; j < len; j += 4) {
        var e1 = lookup[base64.charCodeAt(j)];
        var e2 = lookup[base64.charCodeAt(j + 1)];
        var e3 = lookup[base64.charCodeAt(j + 2)];
        var e4 = lookup[base64.charCodeAt(j + 3)];
        bytes[p++] = (e1 << 2) | (e2 >> 4);
        if (base64[j + 2] !== '=') bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
        if (base64[j + 3] !== '=') bytes[p++] = ((e3 & 3) << 6) | e4;
      }
      return bytes;
    }
    var bytes = new Uint8Array(binStr.length);
    for (var k = 0; k < binStr.length; k++) {
      bytes[k] = binStr.charCodeAt(k);
    }
    return bytes;
  }

  async function extractLines(base64Pdf) {
    var data = base64ToUint8Array(base64Pdf);
    var pdf = await pdfjsLib.getDocument({ data: data }).promise;
    var allLines = [];

    for (var pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      var page = await pdf.getPage(pageNum);
      var textContent = await page.getTextContent();

      var rowMap = new Map();
      for (var i = 0; i < textContent.items.length; i++) {
        var item = textContent.items[i];
        if (!item.str || !item.str.trim()) continue;
        var x = item.transform[4];
        var y = Math.round(item.transform[5]);
        if (!rowMap.has(y)) rowMap.set(y, []);
        rowMap.get(y).push({ x: x, str: item.str });
      }

      var sortedYs = Array.from(rowMap.keys()).sort(function (a, b) { return b - a; });

      for (var yi = 0; yi < sortedYs.length; yi++) {
        var rowY = sortedYs[yi];
        var items = rowMap.get(rowY).sort(function (a, b) { return a.x - b.x; });
        var row = '';
        var prevX = 0;
        for (var ii = 0; ii < items.length; ii++) {
          var itm = items[ii];
          if (!row) {
            row = itm.str;
            prevX = itm.x + itm.str.length * 5;
          } else {
            row += (itm.x - prevX > 80 ? '  ' : ' ') + itm.str;
            prevX = itm.x + itm.str.length * 5;
          }
        }
        allLines.push(row);
      }

      page.cleanup();
    }

    return allLines;
  }

  function postToRN(obj) {
    var msg = JSON.stringify(obj);
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(msg);
    } else {
      window.parent.postMessage(msg, '*');
    }
  }

  window.addEventListener('message', function (event) {
    var data;
    try {
      data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    } catch (e) {
      return;
    }

    if (!data || data.type !== 'EXTRACT') return;

    var id = data.id;

    if (!data.pdf) {
      postToRN({ type: 'ERROR', id: id, message: 'No PDF data received.' });
      return;
    }

    extractLines(data.pdf)
      .then(function (lines) {
        postToRN({ type: 'LINES', id: id, lines: lines });
      })
      .catch(function (err) {
        var msg = err && err.message ? err.message : String(err);
        postToRN({ type: 'ERROR', id: id, message: msg });
      });
  });

  postToRN({ type: 'READY' });
})();
<\/script>
</body>
</html>`;

// ── Component ─────────────────────────────────────────────────────────────────

const PdfWebViewBridge = forwardRef<PdfBridgeRef>((_, ref) => {
  const webViewRef = useRef<WebView>(null);
  const pendingRef = useRef<Map<string, PendingEntry>>(new Map());

  // Expose extractText via ref
  useImperativeHandle(ref, () => ({
    extractText(base64Pdf: string): Promise<string[]> {
      return new Promise<string[]>((resolve, reject) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

        const timer = setTimeout(() => {
          pendingRef.current.delete(id);
          reject(new Error('PDF extraction timed out after 30 seconds.'));
        }, 30_000);

        pendingRef.current.set(id, { resolve, reject, timer });

        const message = JSON.stringify({ type: 'EXTRACT', id, pdf: base64Pdf });
        webViewRef.current?.injectJavaScript(
          `window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(message)} })); true;`
        );
      });
    },
  }));

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    let data: { type: string; id?: string; lines?: string[]; message?: string };
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }

    if (data.type === 'READY') {
      // WebView is loaded and pdfjs is ready — no action needed
      return;
    }

    if (!data.id) return;

    const entry = pendingRef.current.get(data.id);
    if (!entry) return;

    clearTimeout(entry.timer);
    pendingRef.current.delete(data.id);

    if (data.type === 'LINES' && Array.isArray(data.lines)) {
      entry.resolve(data.lines);
    } else if (data.type === 'ERROR') {
      entry.reject(new Error(data.message ?? 'Unknown PDF extraction error.'));
    } else {
      entry.reject(new Error(`Unexpected bridge response type: ${data.type}`));
    }
  }, []);

  return (
    <WebView
      ref={webViewRef}
      source={{ html: EXTRACTOR_HTML }}
      onMessage={handleMessage}
      style={styles.hidden}
      // Allow CDN script to load
      mixedContentMode="always"
      originWhitelist={['*']}
      // Suppress navigation gestures on the hidden view
      scrollEnabled={false}
      // Required for Android WebView to run fetch / modern JS
      javaScriptEnabled={true}
      domStorageEnabled={true}
    />
  );
});

PdfWebViewBridge.displayName = 'PdfWebViewBridge';

export default PdfWebViewBridge;

const styles = StyleSheet.create({
  hidden: {
    width: 0,
    height: 0,
    opacity: 0,
    position: 'absolute',
  },
});
