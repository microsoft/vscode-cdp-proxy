/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { ITransport } from './transports/transports';
import Cdp from './cdp';
import { EventEmitter as NodeEmitter } from 'events';
import { CdpError } from './cdp-error';
import { TaskCancelledError, EventEmitter } from 'cockatiel';

export interface IProtocolCommand {
  id?: number;
  method: string;
  params: object;
  sessionId?: string;
}

export interface IProtocolError {
  id: number;
  method?: string;
  error: { code: number; message: string };
  sessionId?: string;
}

export interface IProtocolSuccess {
  id: number;
  result: object;
  sessionId?: string;
}

type ProtocolMessage = IProtocolCommand | IProtocolSuccess | IProtocolError;

interface IDeferred<T> {
  resolve(data: T): void;
  reject(err: Error): void;
}

/**
 * The Connection provides a high-level wrapper for the underlying Transport.
 */
export class Connection {
  /**
   * Gets the API used to talk to CDP.
   */
  public readonly api = new Proxy({} as any, {
    get: (target, domain: string) => (target[domain] = target[domain] ?? this.createDomain(domain)),
  }) as Cdp.Api;

  private lastId = 0;
  private pauseQueue?: ProtocolMessage[];
  private readonly callbacks = new Map<number, IDeferred<unknown>>();
  private readonly innerEmitter = new NodeEmitter();
  private readonly commandEmitter = new EventEmitter<IProtocolCommand>();
  private readonly replyEmitter = new EventEmitter<IProtocolSuccess | IProtocolError>();

  /**
   * Emitter that fires if an error happens on the underlying transport.
   */
  public readonly onError = this.transport.onError;

  /**
   * Emitter that fires when the underlying connection is closed.
   */
  public readonly onEnd = this.transport.onEnd;

  /**
   * Emitter that fires when any command is received, on addition to any
   * listener set up through the `.api`.
   */
  public readonly onCommand = this.commandEmitter.addListener;

  /**
   * Emitter that fires when any command reply is received.
   */
  public readonly onReply = this.replyEmitter.addListener;

  constructor(private readonly transport: ITransport) {
    transport.onMessage(msg => this.processResponse(msg as ProtocolMessage));
  }

  /**
   * Pauses receiving events, queuing them until unpause is called.
   */
  public pause() {
    this.pauseQueue = this.pauseQueue || [];
  }

  /**
   * Unpauses the event queue, firing any ones that have built up.
   */
  public unpause() {
    console.log('process', this.pauseQueue);
    if (!this.pauseQueue) {
      return;
    }

    const queue = this.pauseQueue;
    this.pauseQueue = undefined;

    for (const item of queue) {
      this.processResponse(item);
    }
  }

  /**
   * Returns a new unique ID for a message, incrementing the internal ID counter.
   */
  public getId() {
    return this.lastId++;
  }

  /**
   * Low-level send command.
   */
  public send(message: ProtocolMessage) {
    this.transport.send(message);
  }

  /**
   * Makes a call to the given method over CDP. Note that you should generally
   * use `.api` for a better, typed interface to this.
   */
  public call<T>(method: string, params: object): Promise<T> {
    const id = this.lastId++;
    const message: IProtocolCommand = { id, method, params };
    this.transport.send(message);

    return new Promise<T>((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
    });
  }

  /**
   * Closes the underlying transport. Cancels any outstanding callbacks.
   */
  public async close() {
    await this.transport.close();
    for (const { reject } of this.callbacks.values()) {
      reject(new TaskCancelledError('CDP connection closed'));
    }

    this.callbacks.clear();
  }

  private createDomain(domain: string) {
    return new Proxy(
      {},
      {
        get: (_target, method: string) => {
          if (method === 'on') {
            return (eventName: string, listener: (params: object) => void) => {
              const evt = `${domain}.${eventName}`;
              this.innerEmitter.on(evt, listener);
              return () => this.innerEmitter.off(evt, listener);
            };
          }

          return (params: object) => this.call(`${domain}.${method}`, params);
        },
      },
    );
  }

  private processResponse(message: ProtocolMessage) {
    if (this.pauseQueue) {
      this.pauseQueue.push(message);
    }

    if (message.id === undefined) {
      // for some reason, TS doesn't narrow this even though IProtocolCommand
      // is the only type of the tuple where id can be undefined.
      const asCommand = message as IProtocolCommand;
      this.commandEmitter.emit(asCommand);
      this.innerEmitter.emit(asCommand.method, asCommand.params);
      return;
    }

    this.replyEmitter.emit(message as IProtocolError | IProtocolSuccess);
    const callback = this.callbacks.get(message.id);
    if (!callback) {
      return;
    }

    this.callbacks.delete(message.id);
    if ('error' in message) {
      callback.reject(new CdpError(message));
    } else if ('result' in message) {
      callback.resolve(message.result);
    }
  }
}
