import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "proj_lghfijukkmrbxhcirmym",
  dirs: ["./src/trigger"],
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 3000,
      maxTimeoutInMs: 30000,
      factor: 2,
      randomize: true,
    },
  },
  maxDuration: 300,
});
