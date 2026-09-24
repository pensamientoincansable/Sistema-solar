/**
 * Entorno de navegador mínimo para las pruebas (jsdom).
 * Hay que instalarlo ANTES de construir los módulos que tocan el DOM.
 */
import { JSDOM } from 'jsdom';

export function installDom(html = '<!doctype html><html><body></body></html>') {
  const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'http://localhost/' });
  const w = dom.window;
  globalThis.window = w;
  globalThis.document = w.document;
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true });
  globalThis.HTMLElement = w.HTMLElement;
  globalThis.requestAnimationFrame = w.requestAnimationFrame
    || ((fn) => setTimeout(() => fn(Date.now()), 16));
  globalThis.cancelAnimationFrame = w.cancelAnimationFrame || clearTimeout;
  globalThis.Blob = w.Blob;
  globalThis.URL.createObjectURL = w.URL.createObjectURL || (() => 'blob:mock');
  globalThis.URL.revokeObjectURL = w.URL.revokeObjectURL || (() => {});
  return dom;
}
