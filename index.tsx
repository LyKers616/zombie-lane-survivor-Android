
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

import { registerSW } from 'virtual:pwa-register';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

const canUseServiceWorker =
  window.location.protocol === 'https:' ||
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

if (canUseServiceWorker) {
  let updateSW: undefined | ((reloadPage?: boolean) => Promise<void>);

  updateSW = registerSW({
    immediate: true,
    async onNeedRefresh() {
      await updateSW?.(true);
      window.location.reload();
    },
    onOfflineReady() {},
  });
}
