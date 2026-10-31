declare module "@mercuryworkshop/wisp-js/server" {
  import type { Buffer } from "node:buffer";
  import type { IncomingMessage } from "node:http";
  import type { Duplex } from "node:stream";

  interface WispServerOptions {
    allow_private_ips: boolean;
    allow_loopback_ips: boolean;
    wisp_version: 1 | 2;
  }

  interface WispServer {
    options: WispServerOptions;
    routeRequest(
      request: IncomingMessage,
      socket: Duplex,
      head: Buffer,
      connectionOptions?: { wisp_version?: 1 | 2 }
    ): void;
  }

  export const server: WispServer;
}

declare module "@rsdoctor/types/dist/manifest" {
  export type RsdoctorManifestSeriesData = import("@rsdoctor/types").Manifest.RsdoctorManifestSeriesData;
  export type RsdoctorManifestWithShardingFiles = import("@rsdoctor/types").Manifest.RsdoctorManifestWithShardingFiles;
}
