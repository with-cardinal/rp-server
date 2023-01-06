import type {
  IncomingMessage,
  ServerResponse,
  RequestListener,
} from "node:http";
import {
  Result,
  Err,
  Ok,
  isOk,
  unwrap,
  Status,
  ValidJSON,
  ValidJSONObject,
} from "@withcardinal/ts-std";
import { RPError } from "./base.js";
import { DEFAULT_BODY_LIMIT } from "./index.js";
import type { Authorization, RPSpec } from "./base.js";

export type ProcedureSpec = {
  mutation?: boolean;
  proc: (
    auth: Authorization,
    payload: unknown
  ) => ValidJSON | Promise<ValidJSON>;
};

export function RPListener(
  spec: RPSpec,
  payloadLimitBytes: number = DEFAULT_BODY_LIMIT
): RequestListener {
  return (req, res) => {
    req.socket.ref();
    const start = process.hrtime.bigint();
    const url = new URL(req.url || "", "http://localhost");

    res.on("finish", () => {
      req.socket.unref();
      const end = process.hrtime.bigint();
      console.log(
        `${req.method} ${url.pathname} ${res.statusCode} ${end - start}ns`
      );
    });

    if (url.pathname === "/rpc" && req.method === "GET") {
      handleQueryRpc(req, res, spec, url);
    } else if (
      url.pathname === "/rpc" &&
      req.method === "POST" &&
      req.headers["content-type"] === "application/json"
    ) {
      handleMutationRpc(req, res, spec, payloadLimitBytes);
    } else {
      errorResponse(res, new RPError("Not found", Status.NotFound));
    }
  };
}

export function handleQueryRpc(
  req: IncomingMessage,
  res: ServerResponse,
  spec: RPSpec,
  url: URL
) {
  const version = readVersion(req);
  const auth = readAuthorization(req);

  const procedure = url.searchParams.get("p");

  const rawArgs = url.searchParams.get("a");

  let args: ValidJSONObject;
  try {
    args = !rawArgs ? rawArgs : JSON.parse(rawArgs);
  } catch (e) {
    errorResponse(
      res,
      new RPError(
        "Argument parse error",
        Status.BadRequest,
        undefined,
        e as Error
      )
    );
    return;
  }

  callProc(spec, version, procedure, auth, args, false).then((result) => {
    if (isOk(result)) {
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end(JSON.stringify(unwrap(result)));
    } else {
      errorResponse(res, result.error);
    }
  });
}

export function handleMutationRpc(
  req: IncomingMessage,
  res: ServerResponse,
  spec: RPSpec,
  payloadLimitBytes: number
) {
  const version = readVersion(req);
  const auth = readAuthorization(req);

  let body = "";

  req.on("end", () => {
    let payload: { p: string; a: ValidJSONObject };
    try {
      payload = JSON.parse(body);
    } catch (e) {
      errorResponse(
        res,
        new RPError(
          "Argument parse error",
          Status.BadRequest,
          undefined,
          e as Error
        )
      );
      return;
    }

    const procedure = payload.p;
    const args = payload.a;

    callProc(spec, version, procedure, auth, args, true).then((result) => {
      if (isOk(result)) {
        res.setHeader("Content-Type", "application/json");
        res.writeHead(200);
        res.end(JSON.stringify(unwrap(result)));
      } else {
        errorResponse(res, result.error);
      }
    });
  });

  let length = 0;

  req.on("data", (data) => {
    length += data.length;
    if (length > payloadLimitBytes) {
      req.removeAllListeners("end");
      req.removeAllListeners("data");

      req.resume();

      errorResponse(
        res,
        new RPError("Payload too large", Status.PayloadTooLarge)
      );
    }

    body += data;
  });
}

function readVersion(req: IncomingMessage): string | undefined {
  const rawVersion = req.headers["rpc-api-version"];
  return Array.isArray(rawVersion) ? rawVersion[0] : rawVersion;
}

function readAuthorization(req: IncomingMessage): Authorization {
  const auth = req.headers["authorization"];
  if (!auth) {
    return { scheme: "", token: "" };
  }

  const parts = auth.split(" ");
  const scheme = parts[0];
  const token = parts[1];

  if (!scheme || !token) {
    return { scheme: "", token: "" };
  }

  return { scheme, token };
}

function errorResponse(res: ServerResponse, error: RPError) {
  res.setHeader("Content-Type", "application/json");
  res.writeHead(error.status);
  res.end(JSON.stringify({ message: error.message, data: error.data }));
}

async function callProc(
  spec: RPSpec,
  version: string | undefined,
  procedureName: string | null,
  auth: Authorization,
  payload: unknown,
  mutation: boolean
): Promise<Result<ValidJSON, RPError>> {
  if (!version) {
    return Err(new RPError("Version not found", Status.NotFound));
  }

  const versionSpec = spec.versions[version];
  if (!versionSpec) {
    return Err(new RPError("Version not found", Status.NotFound));
  }

  if (!procedureName) {
    return Err(new RPError("Procedure not found", Status.NotFound));
  }

  const procedure =
    versionSpec[mutation ? "mutations" : "queries"][procedureName];
  if (!procedure) {
    return Err(new RPError("Procedure not found", Status.NotFound));
  }

  try {
    return Ok(await procedure(auth, payload));
  } catch (e) {
    return Err(
      new RPError(
        "Internal server error",
        Status.InternalServerError,
        undefined,
        e instanceof Error ? e : undefined
      )
    );
  }
}
