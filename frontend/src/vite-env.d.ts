/// <reference types="vite/client" />

declare global {
  interface Window {
    __TESTING_MODE?: boolean;
    __API_RESPONSES?: unknown[];
    __SIMULATE_NETWORK_FAILURE?: boolean;
    __NETWORK_PROFILE?: "offline" | "slow3g" | "normal";
    __ERROR_LOGS?: { message: string; timestamp: string }[];
    __MOCK_API?: boolean;
    __PERMISSION_OVERRIDE?: "prompt" | "granted" | "denied";
    __TIME_SKEW_MS?: number;
  }
}

export {};
