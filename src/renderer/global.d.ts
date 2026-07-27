export {};

declare global {
  interface Window {
    readonly jobSearch: Readonly<{
      version: '0.1.0';
    }>;
  }
}
