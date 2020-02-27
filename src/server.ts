/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { Server as WebSocketServer, ServerOptions } from 'ws';
import { EventEmitter } from 'cockatiel';
import { Connection } from './connection';
import { WebSocketTransport } from './transports/websocket';
import { IDisposable } from './disposable';
import { Server as HttpServer, createServer, IncomingMessage } from 'http';
import { AddressInfo } from 'net';

export interface IServerOptions {
  host: string;
  port: string;
}

/**
 * WebSocket server used to set up a CDP proxy.
 */
export class Server implements IDisposable {
  /**
   * Creates a new server, returning a promise that's resolved when it's opened.
   */
  public static async create(options: Partial<ServerOptions> = {}) {
    const { host = '127.0.0.1', port = 0 } = options;

    const server = createServer((_req, res) => {
      // The adapter makes an http call to discover the address to connect
      // to first. Mock that out here.
      const resolvedPort = port || (server.address() as AddressInfo).port;
      res.write(
        JSON.stringify({
          webSocketDebuggerUrl: `ws://${host}:${resolvedPort}/ws`,
        }),
      );
      res.end();
    });

    const wss = new WebSocketServer({ server });
    server.listen(port);

    return new Server(wss, server);
  }

  private readonly connectionEmitter = new EventEmitter<[Connection, IncomingMessage]>();

  /**
   * Emitter that fires when we get a new connection over CDP.
   */
  public readonly onConnection = this.connectionEmitter.addListener;

  /**
   * Address the server is listening on.
   */
  public readonly address = this.httpServer.address() as AddressInfo;

  protected constructor(
    private readonly wss: WebSocketServer,
    private readonly httpServer: HttpServer,
  ) {
    wss.on('connection', (ws, req) => {
      this.connectionEmitter.emit([new Connection(new WebSocketTransport(ws)), req]);
    });
  }

  /**
   * @inheritdoc
   */
  public dispose() {
    this.wss.close();
    this.httpServer.close();
  }
}
