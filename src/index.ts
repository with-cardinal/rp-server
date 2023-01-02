export * from "./rplistener.js";
export * from "./rperror.js";

import { RPListener, RPListenerSpec } from "./rplistener.js";
import http from "node:http";

export const DEFAULT_BODY_LIMIT = 1_000_000;

export type ServeOptions = {
  timeout: number;
  payloadLimitBytes: number;
};

export function serve(
  spec: RPListenerSpec,
  port: number,
  options: ServeOptions = {
    timeout: 5000,
    payloadLimitBytes: DEFAULT_BODY_LIMIT,
  }
) {
  const listener = RPListener(spec, options.payloadLimitBytes);
  const server = http.createServer(listener);
  server.timeout = options.timeout;
  server.listen(port);
  console.log(`Listening on ${port}`);
}
