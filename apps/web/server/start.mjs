import { spawn } from "node:child_process";
import { createCloudServer, readConfig } from "./cloud-server.mjs";

const config = readConfig();
const child = spawn(process.execPath, ["apps/web/server.js"], { stdio: "inherit", env: { ...process.env, PORT: "3001", HOSTNAME: "127.0.0.1" } });
const server = createCloudServer(config);
server.listen(Number(process.env.PORT || 10000), "0.0.0.0", () => console.log("Wind Planner company gateway started."));
const shutdown = () => { server.close(); child.kill("SIGTERM"); };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
child.on("error", error => { console.error("Interface process failed:", error.message); server.close(); process.exitCode = 1; });
child.on("exit", code => { server.close(); process.exitCode = code ?? 1; });
