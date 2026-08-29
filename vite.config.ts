import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { controlApiPlugin } from "./server/controlApi.js";
import { tiktokAccountWorkerPlugin } from "./server/tiktokAccountWorker.js";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return {
    plugins: [react(), controlApiPlugin(), tiktokAccountWorkerPlugin()],
  };
});
