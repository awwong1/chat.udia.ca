import { Env } from "..";
import handleErrors from "../utils/handleErrors";
import RateLimiterClient from '../utils/rateLimiterClient';


interface Session {
  webSocket: WebSocket;
  blockedMessages: string[];
  name?: string;
  quit?: boolean;
}

export class ChatRoom {
  state: DurableObjectState
  env: Env
  sessions: Session[];
  lastTimeStamp: number;
  storage: DurableObjectStorage;

  constructor(state: DurableObjectState, env: Env) {
    // `state.storage` provides access to durable storage. Provides KV get()/put() interface.
    this.storage = state.storage;
    // `env` contains environment bindings
    this.env = env;
    this.state = state;

    // Put the websocket objects for each client into sessions
    this.sessions = [];
    this.lastTimeStamp = 0;

    // `blockConcurrencyWhile()` ensures no requests are delivered until
    // initialization completes.
    // this.state.blockConcurrencyWhile(async () => {
    //   let stored = await this.state.storage?.get<number>("value");
    //   this.value = stored || 0;
    // })
  }

  // Handle HTTP requests from clients.
  async fetch(request: Request) {
    return await handleErrors(request, async () => {
      let url = new URL(request.url);

      switch (url.pathname) {
        case "/websocket": {
          // The request is to `/api/room/<name>/websocket`. A client is trying to establish a new
          // WebSocket session.
          if (request.headers.get("Upgrade") !== "websocket") {
            return new Response(`expected websocket`, { status: 426 });
          }

          // Get the client's IP address for use with the rate limiter.
          let ip = request.headers.get("CF-Connecting-IP");

          // To accept the WebSocket request, we create a WebSocketPair (which is like a socketpair,
          // i.e. two WebSockets that talk to each other), we return one end of the pair in the
          // response, and we operate on the other end. Note that this API is not part of the
          // Fetch API standard; unfortunately, the Fetch API / Service Workers specs do not define
          // any way to act as a WebSocket server today.
          let pair = new WebSocketPair();

          // We're going to take pair[1] as our end, and return pair[0] to the client.
          await this.handleSession(pair[1], ip);

          // Now we return the other end of the pair to the client.
          return new Response(null, { status: 101, webSocket: pair[0] });
        }

        default:
          return new Response("Not found", { status: 404 });
      }
    });
  }


  async handleSession(webSocket: WebSocket, ip: string | null) {
    webSocket.accept();

    // Setup rate limiter client
    const limiterId = this.env.LIMITERS.idFromName(ip || "");
    const limiter = new RateLimiterClient(
      () => this.env.LIMITERS.get(limiterId),
      (err: Error) => webSocket.close(1011, err.stack));

    // Create the session, add it to the sessions list
    const session: Session = { webSocket, blockedMessages: [] }
    this.sessions.push(session);
    this.sessions.forEach(otherSession => {
      if (otherSession.name) {
        session.blockedMessages.push(JSON.stringify({ joined: otherSession.name }));
      }
    })


    // Load the last 100 messages from the chat history and send them to the client.
    let storage = await this.storage.list<string>({ reverse: true, limit: 100 });
    let backlog = [...storage.values()];
    backlog.reverse();
    backlog.forEach(value => {
      session.blockedMessages.push(value);
    });

    // Set event handlers to receive messages
    let receivedUserInfo = false;
    webSocket.addEventListener('message', async msg => {
      try {
        if (session.quit) {
          // Whoops, when trying to send to this WebSocket in the past, it threw an exception and
          // we marked it broken. But somehow we got another message? I guess try sending a
          // close(), which might throw, in which case we'll try to send an error, which will also
          // throw, and whatever, at least we won't accept the message. (This probably can't
          // actually happen. This is defensive coding.)
          webSocket.close(1011, "WebSocket broken.");
          return;
        }

        // Check if the user is over their rate limit and reject the message if so.
        if (!limiter.checkLimit()) {
          webSocket.send(JSON.stringify({
            error: "Your IP is being rate-limited, please try again later."
          }));
          return;
        }

        // I guess we'll use JSON.
        let data: { name?: string, message?: string, timestamp?: number };
        if (typeof msg.data === 'string') {
          data = JSON.parse(msg.data);
        } else {
          data = JSON.parse(new TextDecoder().decode(msg.data))
        }

        if (!receivedUserInfo) {
          // The first message the client sends is the user info message with their name. Save it
          // into their session object.
          session.name = "" + (data.name || "anonymous");

          // Don't let people use ridiculously long names. (This is also enforced on the client,
          // so if they get here they are not using the intended client.)
          if (session.name.length > 32) {
            webSocket.send(JSON.stringify({ error: "Name too long." }));
            webSocket.close(1009, "Name too long.");
            return;
          }

          // Deliver all the messages we queued up since the user connected.
          session.blockedMessages.forEach(queued => {
            webSocket.send(queued);
          });
          session.blockedMessages = []

          // Broadcast to all other connections that this user has joined.
          this.broadcast(JSON.stringify({ joined: session.name }));

          webSocket.send(JSON.stringify({ ready: true }));

          // Note that we've now received the user info message.
          receivedUserInfo = true;

          return;
        }

        // Construct sanitized message for storage and broadcast.
        data = { name: session.name, message: "" + data.message };

        // console.log(data);

        // Block people from sending overly long messages. This is also enforced on the client,
        // so to trigger this the user must be bypassing the client code.
        if ((data.message?.length || 0) > 256) {
          webSocket.send(JSON.stringify({ error: "Message too long." }));
          return;
        }

        // Add timestamp. Here's where this.lastTimestamp comes in -- if we receive a bunch of
        // messages at the same time (or if the clock somehow goes backwards????), we'll assign
        // them sequential timestamps, so at least the ordering is maintained.
        data.timestamp = Math.max(Date.now(), this.lastTimeStamp + 1);
        this.lastTimeStamp = data.timestamp;

        // Broadcast the message to all other WebSockets.
        let dataStr = JSON.stringify(data);
        this.broadcast(dataStr);

        // Save message.
        let key = new Date(data.timestamp).toISOString();
        await this.storage.put(key, dataStr);
      } catch (error) {
        // Report any exceptions directly back to the client. As with our handleErrors() this
        // probably isn't what you'd want to do in production, but it's convenient when testing.
        webSocket.send(JSON.stringify(error));
      }
    })

    // on 'close' and 'error' events, remove websocket from sessions and broadcast quit message
    const closeOrErrorHandler = (evt: Event) => {
      session.quit = true;
      this.sessions = this.sessions.filter(member => member !== session);
      if (session.name) {
        this.broadcast(JSON.stringify({ quit: session.name }));
      }
    }

    webSocket.addEventListener("close", closeOrErrorHandler)
    webSocket.addEventListener("error", closeOrErrorHandler)
  }

  // broadcast() broadcasts a message to all clients.
  broadcast(message: string) {
    // Iterate over all the sessions sending them messages.
    const quitters: Session[] = [];
    this.sessions = this.sessions.filter(session => {
      if (session.name) {
        try {
          session.webSocket.send(message);
          return true;
        } catch (err) {
          // Whoops, this connection is dead. Remove it from the list and arrange to notify
          // everyone below.
          session.quit = true;
          quitters.push(session);
          return false;
        }
      } else {
        // This session hasn't sent the initial user info message yet, so we're not sending them
        // messages yet (no secret lurking!). Queue the message to be sent later.
        session.blockedMessages.push(message);
        return true;
      }
    });

    quitters.forEach(quitter => {
      if (quitter.name) {
        this.broadcast(JSON.stringify({ quit: quitter.name }));
      }
    });
  }
}
