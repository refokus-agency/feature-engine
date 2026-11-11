import type { NavigateEvent, NavigateHandler } from '../../types.ts';

/** The minimal structural shape of the Webflow runtime. No dependency on Webflow. */
export interface WebflowLike {
  destroy(): void;
  ready(): void;
  /** Undefined on a site that does not ship IX2. */
  require(name: 'ix2'): { init(): void } | undefined;
}

// The incoming page's `data-wf-page`, read from the fetched document's <html>.
function readPageId(html: string | undefined): string | null {
  if (html === undefined) return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.documentElement.getAttribute('data-wf-page');
}

async function reinit(
  webflow: WebflowLike,
  event: NavigateEvent,
): Promise<void> {
  try {
    await event.ready;
    // A newer navigation took over while features mounted; it re-inits on its own.
    if (event.signal.aborted) return;
    const pageId = readPageId(event.nav.html);
    if (pageId !== null) {
      document.documentElement.setAttribute('data-wf-page', pageId);
    }
    webflow.destroy();
    webflow.ready();
    webflow.require('ix2')?.init();
  } catch (error) {
    // Webflow errors are reported, never rejected into the runtime.
    console.warn('[webflow] re-init failed:', error);
  }
}

/**
 * An `onNavigate` handler that re-initializes Webflow and IX2 after every
 * navigation except the first load, once the page's features have settled.
 */
export function webflowReinit(webflow: WebflowLike): NavigateHandler {
  return (event: NavigateEvent): void => {
    if (event.nav.initial) return;
    void reinit(webflow, event);
  };
}
