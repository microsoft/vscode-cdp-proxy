/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { Event } from 'cockatiel';

export interface ITransport {
  /**
   * Sends the given message.
   */
  send(message: object): void;

  /**
   * Closees the transport, returning a promise that returns once it's done.
   */
  close(): Promise<void>;

  /**
   * Emitter that fires if there's an error with the underlying transport.
   */
  onError: Event<Error>;

  /**
   * Emitter that fires when a new message comes in.
   */
  onMessage: Event<object>;

  /**
   * Emitter that fires when the underlying transport closes
   */
  onEnd: Event<void>;
}
