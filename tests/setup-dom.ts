import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { resetJobSearchFake } from './helpers/bridge';

beforeEach(() => {
  if (typeof window !== 'undefined') resetJobSearchFake();
});

afterEach(() => {
  cleanup();
});
