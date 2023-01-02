export * from "./rplistener";
export * from "./rperror";

import { RPListener, RPListenerSpec } from "./rplistener";
import http from "node:http";

export function serve(spec: RPListenerSpec, port: number, timeout = 5000) {
  const listener = RPListener(spec);
  const server = http.createServer(listener);
  server.timeout = timeout;
  server.listen(port);
  console.log(`Listening on ${port}`);
}
