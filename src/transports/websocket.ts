/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as WebSocket from 'ws';
import { ITransport } from './transports';
import { CancellationToken, TaskCancelledError, EventEmitter } from 'cockatiel';

export class WebSocketError extends Error {
  constructor(public readonly cause: WebSocket.ErrorEvent) {
    super(cause.message);
  }
}

/**
 * A WebSocket-based transports. Can connect to a URL via
 * {@link WebSocketTransport.create} or be created from a {@link WebSocket}
 * received by other means.
 */
export class WebSocketTransport implements ITransport {
  private ws: WebSocket | undefined;
  private endEmitter = new EventEmitter<void>();
  private messageEmitter = new EventEmitter<object>();
  private errorEmitter = new EventEmitter<Error>();

  /**
   * @inheritdoc
   */
  public onMessage = this.messageEmitter.addListener;

  /**
   * @inheritdoc
   */
  public onError = this.errorEmitter.addListener;

  /**
   * @inheritdoc
   */
  public onEnd = this.endEmitter.addListener;

  /**
   * Creates a new websocket transport connecting to the given URL.
   */
  public static async create(
    url: string,
    cancellationToken: CancellationToken = CancellationToken.None,
  ): Promise<WebSocketTransport> {
    const ws = new WebSocket(url, [], {
      perMessageDeflate: false,
      maxPayload: 256 * 1024 * 1024, // 256Mb
    });

    return await new Promise<WebSocketTransport>((resolve, reject) => {
      const onCancel = cancellationToken.onCancellationRequested(() => {
        ws.close();
        reject(new TaskCancelledError());
      });

      ws.addEventListener('open', () => {
        resolve(new WebSocketTransport(ws));
        onCancel.dispose();
      });
      ws.addEventListener('error', () => {
        reject();
        onCancel.dispose();
      });
    });
  }

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.addEventListener('message', (event) => {
      this.messageEmitter.emit(JSON.parse(event.data as string));
    });

    this.ws.addEventListener('close', () => {
      this.endEmitter.emit();
    });

    this.ws.addEventListener('error', (error) => {
      this.errorEmitter.emit(new WebSocketError(error));
    });
  }

  /**
   * @inheritdoc
   */
  public send(message: object) {
    this.ws?.send(JSON.stringify(message));
  }

  /**
   * @inheritdoc
   */
  public async close(): Promise<void> {
    if (!this.ws) {
      return;
    }

    let callback: () => void;
    const result = new Promise<void>((f) => (callback = f));
    this.ws.addEventListener('close', () => callback());
    this.ws.close();
    this.ws = undefined;

    return result;
  }
}
