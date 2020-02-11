/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { IProtocolError } from './connection';

export class CdpError extends Error {
  constructor(public readonly cause: IProtocolError) {
    super(cause.error.message);
  }
}
