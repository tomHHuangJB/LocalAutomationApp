module.exports = {
  testMatch: ["**/tests/**/*.test.ts"],
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { useESM: true }]
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1"
  },
  setupFiles: ["<rootDir>/tests/setup.js"],
  collectCoverageFrom: ["src/**/*.ts"],
  coverageThreshold: {
    global: {
      lines: 80
    }
  }
};
