import { after, describe, it } from "node:test";
import request from "supertest";
import { RPListener } from "./rplistener.js";
import http from "node:http";
import { Status, ValidJSONObject } from "@withcardinal/ts-std";
import assert from "node:assert";

const spec = {
  versions: {
    "1": {
      hello: {
        proc: (payload: ValidJSONObject) => {
          const name = payload["name"];
          return { say: `Hello ${name}` };
        },
      },
      queryError: {
        proc: () => {
          throw new Error("Oh no");
        },
      },
      mutate: {
        mutation: true,
        proc: () => {
          return { ok: true };
        },
      },
      mutateError: {
        mutation: true,
        proc: () => {
          throw new Error("Oh no");
        },
      },
    },
  },
};

const server = http.createServer(RPListener(spec));

after(() => {
  server.close();
});

describe("query", () => {
  it("fails when version is missing", async () => {
    const response = await request(server)
      .get("/rpc?p=hello")
      .set("rpc-api-version", "2");

    assert.strictEqual(response.status, Status.NotFound);
  });

  it("fails when procedure is missing", async () => {
    const response = await request(server)
      .get("/rpc")
      .set("rpc-api-version", "1");

    assert.strictEqual(response.status, Status.NotFound);
  });

  it("fails when args are invalid format", async () => {
    const response = await request(server)
      .get("/rpc?p=hello&a={blah}")
      .set("rpc-api-version", "1");

    assert.strictEqual(response.status, Status.BadRequest);
  });

  it("fails when error is thrown", async () => {
    const response = await request(server)
      .get("/rpc?p=queryError")
      .set("rpc-api-version", "1");

    assert.strictEqual(response.status, Status.InternalServerError);
  });

  it("succeeds", async () => {
    const response = await request(server)
      .get(
        `/rpc?p=hello&a=${encodeURIComponent(
          JSON.stringify({ name: "World" })
        )}`
      )
      .set("rpc-api-version", "1");

    assert.strictEqual(response.status, Status.OK);
    assert.deepEqual(response.body, { say: "Hello World" });
  });
});

describe("mutation", () => {
  it("fails when version is missing", async () => {
    const response = await request(server)
      .post("/rpc")
      .send({ p: "mutate" })
      .set("rpc-api-version", "2")
      .set("content-type", "application/json");

    assert.strictEqual(response.status, Status.NotFound);
  });

  it("fails when procedure is missing", async () => {
    const response = await request(server)
      .post("/rpc")
      .send({ p: "missing" })
      .set("rpc-api-version", "1")
      .set("content-type", "application/json");

    assert.strictEqual(response.status, Status.NotFound);
  });

  it("fails when payload is invalid format", async () => {
    const response = await request(server)
      .post("/rpc")
      .send("{blah}")
      .set("rpc-api-version", "1")
      .set("content-type", "application/json");

    assert.strictEqual(response.status, Status.BadRequest);
  });

  it("fails when error is thrown", async () => {
    const response = await request(server)
      .post("/rpc")
      .send({ p: "mutateError" })
      .set("rpc-api-version", "1")
      .set("content-type", "application/json");

    assert.strictEqual(response.status, Status.InternalServerError);
  });

  it("succeeds", async () => {
    const response = await request(server)
      .post("/rpc")
      .send({ p: "mutate", a: { name: "Whatever" } })
      .set("rpc-api-version", "1")
      .set("content-type", "application/json");

    assert.strictEqual(response.status, Status.OK);
  });
});
