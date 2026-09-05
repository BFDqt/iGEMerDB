import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import source from './fixtures/test_export.json';
import { initializeDatabase } from '../data';
import type { RawDataset } from '../types';

initializeDatabase(source as RawDataset);

Object.defineProperty(window, 'scrollTo', {
  configurable: true,
  value: vi.fn(),
});

if (typeof HTMLDialogElement !== 'undefined') {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value() {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    },
  });
}
