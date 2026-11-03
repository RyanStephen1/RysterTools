import { cpSync, rmSync } from 'node:fs';

rmSync(new URL('./dist/', import.meta.url), { recursive: true, force: true });
cpSync(new URL('./apps/home/', import.meta.url), new URL('./dist/', import.meta.url), { recursive: true });
cpSync(new URL('./apps/finance/dist/', import.meta.url), new URL('./dist/finance/', import.meta.url), { recursive: true });
