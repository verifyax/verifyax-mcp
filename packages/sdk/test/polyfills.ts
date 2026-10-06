/**
 * MSW 3's fetch interceptors call Promise.withResolvers (Node 22+). The workspace
 * still tests on Node 20 per engines/ci matrix.
 */
function installPromiseWithResolversPolyfill(): void {
  if (typeof Promise.withResolvers === 'function') {
    return;
  }

  Promise.withResolvers = function withResolvers<T>(): {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
  } {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

installPromiseWithResolversPolyfill();
