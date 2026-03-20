import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatApp } from './ChatApp';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import 'katex/dist/katex.min.css';
import '../../styles/chat.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <ChatApp />
    </ErrorBoundary>
  </React.StrictMode>
);
