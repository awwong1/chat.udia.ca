import { Env } from '..';
import handleErrors from '../utils/handleErrors';

export class RateLimiter {
  state: DurableObjectState
  nextAllowedTime: number

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.nextAllowedTime = 0
  }

  async fetch(request: Request) {
    return await handleErrors(request, async () => {
      const now = Date.now() / 1000;
      this.nextAllowedTime = Math.max(now, this.nextAllowedTime);

      if (request.method === 'POST') {
        // Allow one action every 5 seconds
        this.nextAllowedTime += 5;
      }

      // Return number of seconds that the client needs to wait
      // Allow a 20 second 'grace' period
      const cooldown = Math.max(0, this.nextAllowedTime - now - 20);
      return new Response(`${cooldown}`);
    })

  }
}
