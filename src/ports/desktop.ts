export type DesktopRequest = { op: string } & Record<string, unknown>;

export interface DesktopControl {
  request(request: DesktopRequest, signal?: AbortSignal): Promise<Record<string, unknown>>;
}
