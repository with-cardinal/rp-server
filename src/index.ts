export * from "./rplistener";
export * from "./rperror";

import { RPListener, RPListenerSpec } from "./rplistener";
import http from "node:http";

export function serve(spec: RPListenerSpec, port: number) {
  const listener = RPListener(spec);
  const server = http.createServer(listener);
  server.listen(port);
  console.log(`Listening on ${port}`);
}
