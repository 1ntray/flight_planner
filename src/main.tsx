import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import { registerChartTileCache } from './app/map/registerChartTileCache';
import 'leaflet/dist/leaflet.css';
import './app/app.css';

const rootElement = document.getElementById('root');

registerChartTileCache();

if (rootElement === null) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
