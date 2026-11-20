/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testRegex: ".*\\.e2e-spec\\.ts$",
  transform: { "^.+\\.(t|j)s$": "ts-jest" },
  testEnvironment: "node",
  setupFiles: ["<rootDir>/test/setup.ts"],
  moduleNameMapper: {
    "^@intelekia/shared$": "<rootDir>/../../packages/shared/src/index.ts",
  },
};
