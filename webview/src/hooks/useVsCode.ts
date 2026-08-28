import { useEffect, useRef } from 'react';
import { WebviewToHostMessage, HostToWebviewMessage } from '../../src/common/messages';

let vscodeApi: any = null;

export function getVsCodeApi() {
  if (!vscodeApi) {
    if (typeof acquireVsCodeApi !== 'undefined') {
      vscodeApi = acquireVsCodeApi();
    } else {
      // Mock API for browser preview / local testing
      vscodeApi = {
        postMessage: (msg: any) => console.log('[Mock VSCode postMessage]', msg),
        getState: () => ({}),
        setState: (s: any) => console.log('[Mock VSCode setState]', s),
      };
    }
  }
  return vscodeApi;
}

export function useVsCodeMessage(handler: (msg: HostToWebviewMessage) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.data && event.data.type) {
        handlerRef.current(event.data as HostToWebviewMessage);
      }
    };

    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  const sendMessage = (message: WebviewToHostMessage) => {
    getVsCodeApi().postMessage(message);
  };

  return { sendMessage };
}
