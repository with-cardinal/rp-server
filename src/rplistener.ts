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
import { RPError } from "./rperror.js";

const BODY_LIMIT = 1_000_000;

export type RPListenerSpec = {
  versions: Record<string, VersionSpec>;
};

export type VersionSpec = Record<string, ProcedureSpec>;

export type ProcedureSpec = {
  mutation?: boolean;
  proc: (payload: ValidJSONObject) => Promise<ValidJSON> | ValidJSON;
};

export function RPListener(spec: RPListenerSpec): RequestListener {
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
      handleMutationRpc(req, res, spec);
    } else {
      errorResponse(res, new RPError("Not found", Status.NotFound));
    }
  };
}

export function handleQueryRpc(
  req: IncomingMessage,
  res: ServerResponse,
  spec: RPListenerSpec,
  url: URL
) {
  const version = readVersion(req);
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

  callProc(spec, version, procedure, args, false).then((result) => {
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
  spec: RPListenerSpec
) {
  const version = readVersion(req);

  let body = "";
  let length = 0;

  req.on("data", (data) => {
    length += data.length;
    if (length > BODY_LIMIT) {
      errorResponse(
        res,
        new RPError("Payload too large", Status.PayloadTooLarge)
      );
    }

    body += data;
  });

  req.on("end", () => {
    // response has already been sent if body is too long
    if (length > BODY_LIMIT) {
      return;
    }

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

    callProc(spec, version, procedure, args, true).then((result) => {
      if (isOk(result)) {
        res.setHeader("Content-Type", "application/json");
        res.writeHead(200);
        res.end(JSON.stringify(unwrap(result)));
      } else {
        errorResponse(res, result.error);
      }
    });
  });
}

function readVersion(req: IncomingMessage): string | undefined {
  const rawVersion = req.headers["rpc-api-version"];
  return Array.isArray(rawVersion) ? rawVersion[0] : rawVersion;
}

function errorResponse(res: ServerResponse, error: RPError) {
  res.setHeader("Content-Type", "application/json");
  res.writeHead(error.status);
  res.end(JSON.stringify({ message: error.message, data: error.data }));
}

async function callProc(
  spec: RPListenerSpec,
  version: string | undefined,
  procedure: string | null,
  payload: ValidJSONObject,
  mutation: boolean
): Promise<Result<ValidJSON, RPError>> {
  if (!version) {
    return Err(new RPError("Version not found", Status.NotFound));
  }

  const versionSpec = spec.versions[version];
  if (!versionSpec) {
    return Err(new RPError("Version not found", Status.NotFound));
  }

  if (!procedure) {
    return Err(new RPError("Procedure not found", Status.NotFound));
  }

  const procedureSpec = versionSpec[procedure];
  if (!procedureSpec) {
    return Err(new RPError("Procedure not found", Status.NotFound));
  }

  if (mutation !== !!procedureSpec.mutation) {
    return Err(new RPError("Method not allowed", Status.MethodNotAllowed));
  }

  try {
    return Ok(await procedureSpec.proc(payload));
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
