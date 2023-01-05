import { after, describe, it } from "node:test";
import request from "supertest";
import { RPListener } from "./rplistener.js";
import http from "node:http";
import { Status } from "@withcardinal/ts-std";
import assert from "node:assert";
import type { Authorization } from "@withcardinal/rp-client";

export const spec = {
  versions: {
    "1": {
      hello: {
        proc: (_auth: Authorization, payload: { name: string }) => {
          return { say: `Hello ${payload.name}` };
        },
      },
      queryError: {
        proc: () => {
          throw new Error("Oh no");
        },
      },
      queryAuth: {
        proc: (auth: Authorization) => {
          return auth;
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
      mutateAuth: {
        mutation: true,
        proc: (auth: Authorization) => {
          return auth;
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

  it("handles authorization", async () => {
    const response = await request(server)
      .get(`/rpc?p=queryAuth`)
      .set("rpc-api-version", "1")
      .set("authorization", "Bearer Hi");

    assert.strictEqual(response.status, Status.OK);
    assert.deepEqual(response.body, { scheme: "Bearer", token: "Hi" });
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

  it("fails when payload is too long", async () => {
    const response = await request(server)
      .post("/rpc")
      .send({ p: "mutate", a: "a".repeat(1_000_001) })
      .set("rpc-api-version", "1")
      .set("content-type", "application/json");

    assert.strictEqual(response.status, Status.PayloadTooLarge);
  });

  it("fails when error is thrown", async () => {
    const response = await request(server)
      .post("/rpc")
      .send({ p: "mutateError" })
      .set("rpc-api-version", "1")
      .set("content-type", "application/json");

    assert.strictEqual(response.status, Status.InternalServerError);
  });

  it("handles auth", async () => {
    const response = await request(server)
      .post("/rpc")
      .send({ p: "mutateAuth" })
      .set("rpc-api-version", "1")
      .set("content-type", "application/json")
      .set("authorization", "Bearer Hi");

    assert.strictEqual(response.status, Status.OK);
    assert.deepEqual(response.body, { scheme: "Bearer", token: "Hi" });
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
