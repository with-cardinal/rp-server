import type { ValidJSON, ValidJSONObject, Status } from "@withcardinal/ts-std";

export type Authorization = {
  scheme: string;
  token: string;
};

export type RPSpec = {
  versions: Record<string, VersionSpec>;
};

export type VersionSpec = { queries: ProcedureSet; mutations: ProcedureSet };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ProcedureSet = Record<string, Procedure<any, any>>;

export type ProcedureReturn = ValidJSON | Promise<ValidJSON>;

type Procedure<
  T extends ValidJSONObject | undefined,
  R extends ProcedureReturn
> = (auth: Authorization, payload: T) => R;

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
