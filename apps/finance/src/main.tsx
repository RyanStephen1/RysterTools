import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const root = createRoot(document.getElementById('root')!);

async function start() {
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    root.render(
      <main className="mx-auto max-w-xl space-y-4 p-8">
        <h1 className="text-2xl font-bold">ADK Finance setup required</h1>
        <p>Add the Supabase URL and public anon key to the deployment environment, then rebuild.</p>
        <a className="underline" href="/">Back to Operations Desk</a>
      </main>,
    );
    return;
  }

  const { default: App } = await import('./App.tsx');
  root.render(<StrictMode><App /></StrictMode>);
}

void start();
