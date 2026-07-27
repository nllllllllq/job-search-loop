import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld(
  'jobSearch',
  Object.freeze({
    version: '0.1.0',
  }),
);
