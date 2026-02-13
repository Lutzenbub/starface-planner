import { pathToFileURL } from 'node:url';
import type { Server } from 'node:http';
import { createApp, type CreateAppOptions } from './app.js';

export interface StartedServer {
  server: Server;
  url: string;
  port: number;
}

export interface StartServerOptions extends CreateAppOptions {
  port?: number;
}

export const startServer = async (options: StartServerOptions = {}): Promise<StartedServer> => {
  const appContext = createApp(options);
  const listenPort = options.port ?? appContext.config.port;

  return new Promise<StartedServer>((resolve, reject) => {
    const server = appContext.app.listen(listenPort, () => {
      const address = server.address();
      const resolvedPort = typeof address === 'object' && address ? address.port : listenPort;
      resolve({
        server,
        port: resolvedPort,
        url: `http://127.0.0.1:${resolvedPort}`,
      });
    });

    server.on('error', reject);
  });
};

const runAsMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (runAsMain) {
  startServer()
    .then(({ url }) => {
      console.log(`Starface backend listening on ${url}`);
    })
    .catch((error) => {
      console.error('Failed to start backend server:', error);
      process.exit(1);
    });
}
