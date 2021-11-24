export class RateLimiterClient {

  getLimiterStub: () => DurableObjectStub;
  reportError: (e: Error) => void;
  limiter: DurableObjectStub;
  inCoolDown: boolean;

  constructor(getLimiterStub: () => DurableObjectStub, reportError: (e: Error) => void) {
    this.getLimiterStub = getLimiterStub
    this.reportError = reportError

    this.limiter = getLimiterStub()
    this.inCoolDown = false;
  }

  // Call checkLimit() when a message is received to decide if it should be blocked due to the
  // rate limit. Returns `true` if the message should be accepted, `false` to reject.
  checkLimit() {
    if (this.inCoolDown) {
      return false
    }
    this.inCoolDown = true;
    this.callLimiter();
    return true;
  }

  async callLimiter() {
    try {
      let response;
      try {
        response = await this.limiter.fetch('https://dummy-url', { method: 'POST' })
      } catch (error) {
        this.limiter = this.getLimiterStub();
        response = await this.limiter.fetch('https://dummy-url', { method: 'POST' })
      }

      let cooldown = +(await response.text());
      await new Promise((resolve, reject) => {
        try {
          setTimeout(() => resolve(() => {}), cooldown * 1000)
        } catch (error) {
          reject(error)
        }
      })

      this.inCoolDown = false
    } catch (error) {
      this.reportError(error as Error);
    }
  }
}

export default RateLimiterClient
