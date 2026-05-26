export interface RuntimeFlags {
  exec: boolean;
  json: boolean;
  autoApprove: boolean;
}

export const runtime: RuntimeFlags = {
  exec: false,
  json: false,
  autoApprove: false,
};

export function setRuntime(flags: Partial<RuntimeFlags>): void {
  Object.assign(runtime, flags);
}
