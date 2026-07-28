import type { JobSearchApi } from '../shared/ipc';

declare global {
  interface Window {
    readonly jobSearch: JobSearchApi;
  }
}

export {};
