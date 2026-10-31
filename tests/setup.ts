import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { createChromeMock } from './chrome-mock';
import { resetDBConnection } from '@/storage/indexeddb/db';

globalThis.__BREWTAB_E2E__ = false;

beforeEach(async () => {
  await resetDBConnection();
  globalThis.indexedDB = new IDBFactory();
  (globalThis as unknown as { chrome: unknown }).chrome = createChromeMock();
});

afterEach(() => {
  cleanup();
});
