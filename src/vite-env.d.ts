/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_TIMEOUT_MS?: string;
  readonly VITE_VOICE_BACKEND?: "auto" | "demo" | "http";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
