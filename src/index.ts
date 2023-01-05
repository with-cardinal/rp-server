export * from "./rplistener.js";
export * from "./rperror.js";

import { RPListener } from "./rplistener.js";
import http from "node:http";
import type { RPSpec } from "./types.js";

export const DEFAULT_BODY_LIMIT = 1_000_000;

export type ServeOptions = {
  timeout: number;
  payloadLimitBytes: number;
};

export async function serve(
  spec: RPSpec,
  port: number,
  options: ServeOptions = {
    timeout: 5000,
    payloadLimitBytes: DEFAULT_BODY_LIMIT,
  }
): Promise<() => Promise<void>> {
  return await new Promise((resolve) => {
    const listener = RPListener(spec, options.payloadLimitBytes);
    const server = http.createServer(listener);
    server.timeout = options.timeout;
    server.listen(port, () => {
      console.log(`Listening on ${port}`);
      resolve(
        () =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          })
      );
    });
  });
}
