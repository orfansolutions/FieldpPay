import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Register PWA Service Worker
registerSW();

// Suppress benign Vite WebSocket errors
const originalConsoleError = console.error;
console.error = (...args) => {
  const msg = args[0]?.message || args[0];
  if (typeof msg === 'string' && (
    msg.includes('[vite]') || 
    msg.includes('WebSocket') || 
    msg.includes('websocket') ||
    msg.includes('WebSocket closed without opened')
  )) {
    return;
  }
  originalConsoleError.apply(console, args);
};

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const message = reason?.message || (typeof reason === 'string' ? reason : '');
  
  // Suppress common dev server noise
  if (message && (
    message.includes('WebSocket') || 
    message.includes('websocket') || 
    message.includes('[vite]') ||
    message.includes('WebSocket closed without opened') ||
    message.includes('WS_CLOSED')
  )) {
    event.preventDefault();
    return;
  }

  // Auto-reload on Chunk Load Errors (new version deployment)
  if (message && (
    message.includes('Failed to fetch') || 
    message.includes('dynamically imported module') ||
    message.includes('Loading chunk')
  )) {
    const lastReload = sessionStorage.getItem('last_chunk_reload');
    const now = Date.now();
    if (!lastReload || now - parseInt(lastReload) > 10000) {
      sessionStorage.setItem('last_chunk_reload', now.toString());
      window.location.reload();
    }
  }
});

window.addEventListener('error', (event) => {
  const message = event.message || '';
  
  if (message && (message.includes('[vite]') || message.includes('WebSocket') || message.includes('websocket'))) {
    event.preventDefault();
    return;
  }

  // Auto-reload on Chunk Load Errors
  if (message && (
    message.includes('Failed to fetch') || 
    message.includes('dynamically imported module') ||
    message.includes('Loading chunk')
  )) {
    const lastReload = sessionStorage.getItem('last_chunk_reload');
    const now = Date.now();
    if (!lastReload || now - parseInt(lastReload) > 10000) {
      sessionStorage.setItem('last_chunk_reload', now.toString());
      window.location.reload();
    }
  }
}, true);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
