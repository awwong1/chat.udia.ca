# chat.udia.ca

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

This is a port of [cloudflare/workers-chat-demo](https://github.com/cloudflare/workers-chat-demo) that uses React, served through [Cloudflare pages](https://pages.cloudflare.com/) along with [Cloudflare Workers Durable Objects](https://developers.cloudflare.com/workers/learning/using-durable-objects).

## Getting Started

```bash
yarn
yarn start
# in a separate shell
cd durable_objects
yarn pub # needs to be run at least once, can't do dev serve without deploying durable objects
yarn dev
```

## LICENSE

[MIT](LICENSE)
