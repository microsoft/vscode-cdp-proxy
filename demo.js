/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

// A simple demo proxy that just logs traffic going back and forth.

const { Connection, Server, WebSocketTransport } = require('./dist');

// Target debug address to connect to:
const targetAddress = 'ws://localhost:9222/devtools/browser/7b2a52b9-f097-425a-b43c-18f0a50cdc0b';

(async () => {
  const server = await Server.create({ port: 13608 });

  server.onConnection(async toDebugger => {
    console.log('Got connection from debugger');
    toDebugger.onError(err => console.error('Error on debugger transport', err));
    toDebugger.pause(); // don't listen for events until the target is ready

    const toTarget = new Connection(await WebSocketTransport.create(targetAddress));
    console.log('Connected to target');
    toTarget.onError(err => console.error('Error on target transport', err));

    // Copy commands (requests) from one pipe to the other.
    toTarget.onCommand(evt => {
      console.log(`target -> debugger`, evt);
      toDebugger.send(evt);
    });
    toDebugger.onCommand(evt => {
      console.log(`debugger -> target`, evt);
      toTarget.send(evt);
    });

    // Copy replies (responses) the same way
    toTarget.onReply(evt => {
      console.log(`target -> debugger`, evt);
      toDebugger.send(evt);
    });
    toDebugger.onReply(evt => {
      console.log(`debugger -> target`, evt);
      toTarget.send(evt);
    });

    // dequeue any messages we got in the meantime
    toDebugger.unpause();
  });

  console.log('Server listening on port', server.address.port)
})();
