/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

// A simple demo proxy that just logs traffic going back and forth.

const { Connection, Server, WebSocketTransport } = require('./');

(async () => {
  const server = await Server.create({ port: 8999});

  server.onConnection(async ([toDebugger, req]) => {
    console.log('Got connection from debugger');
    toDebugger.onError(err => console.error('Error on debugger transport', err));
    toDebugger.pause(); // don't listen for events until the target is ready

    const url = new URL('http://localhost' + req.url);
    const browserInspectUri = url.searchParams.get('browser');

    const toTarget = new Connection(await WebSocketTransport.create(browserInspectUri));
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

    // // dequeue any messages we got in the meantime
    toDebugger.unpause();
  });

  console.log('Server listening on port', server.address.port)
})();
