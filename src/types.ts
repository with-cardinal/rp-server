import type { ValidJSON } from "@withcardinal/ts-std";

export type RPSpec = {
  versions: Record<string, VersionSpec>;
};

export type VersionSpec = Record<string, ProcedureSpec>;

export type Authorization = {
  scheme: string;
  token: string;
};

export type ProcedureSpec = {
  mutation?: boolean;
  proc: (
    auth: Authorization,
    payload: unknown
  ) => ValidJSON | Promise<ValidJSON>;
};
