import { useLayoutEffect, useRef } from 'react';

export const assetRoot = '/__mockup/images/narke-payment/';
export const routeRoot = '/__mockup/preview/payment-immersive/';

export function documentFor(body: string) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NARKE — Paiement démo</title></head><body>${body}</body></html>`;
}

export function PreviewFrame({ title, html, css }: { title: string; html: string; css: string }) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    // Trusted local mockup markup, never user/API content. Keep navigation in
    // the preview itself rather than accumulating nested opaque srcdoc frames.
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
    node.innerHTML = `<style>${css}</style>${html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')}`;
    scripts.forEach(([, body]) => {
      const script = document.createElement('script');
      script.textContent = `(() => {${body}\n})();`;
      node.appendChild(script);
    });
    return () => node.replaceChildren();
  }, [html, css]);
  return <div ref={root} aria-label={title} style={{ minHeight: '100dvh' }} />;
}

export function linkTo(page: 'Payment' | 'Pending' | 'Success' | 'Failure') {
  return `${routeRoot}${page}`;
}

