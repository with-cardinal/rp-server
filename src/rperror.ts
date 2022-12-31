import type { Status } from "@withcardinal/ts-std";

export class RPError extends Error {
  status: Status;
  data?: unknown;
  source?: Error | undefined;

  constructor(msg: string, status: Status, data?: unknown, source?: Error) {
    super(msg);

    this.status = status;
    this.data = data;
    this.source = source;

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, RPError.prototype);
  }
}
