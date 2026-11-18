/** Set on SIGTERM: readiness turns false so Nginx stops sending new requests here. */
export const lifecycle = { draining: false };
