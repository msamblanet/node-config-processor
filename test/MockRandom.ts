import crypto from 'node:crypto';
import type { Jest } from '@jest/environment';

export class MockRandom {
  protected index = -1;
  protected randomData: number[] = [];

  constructor(jestObject: Jest) {

    const mock = {
      default: {
        ...crypto,
        randomBytes: (length: number, callback?: (err: Error | null, buf: Buffer) => void): Buffer | void => this.randomBytes(length, callback)
      }
    }

    jestObject.unstable_mockModule('node:crypto', () => mock);
    jestObject.unstable_mockModule('crypto', () => mock);
  }

  public setRandom(randomData: number[]) {
    this.randomData = randomData;
    this.index = 0;
  }

  public reset() {
    this.randomData = [];
    this.index = -1;
  }

  public randomBytes(length: number, callback?: (err: Error | null, buf: Buffer) => void): Buffer | void {
    if (this.index < 0) {
      if (callback) return crypto.randomBytes(length, callback);
      else return crypto.randomBytes(length);
    } else {
      const rv = Buffer.from(this.randomData.slice(this.index, length));
      this.index += length;
      if (callback) callback(null, rv);
      return rv;
    }
  }
}

export default MockRandom;
