import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from '@/app/AppShell';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import './styles/index.css';

const container = document.getElementById('root');
if (container === null) throw new Error('Scribble could not find its root element.');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary label="Scribble">
      <AppShell />
    </ErrorBoundary>
  </StrictMode>,
);
