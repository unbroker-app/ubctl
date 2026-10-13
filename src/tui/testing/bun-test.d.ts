// Minimal typings for the `bun:test` API used by the TUI tests. The full
// @types/bun package redefines globals like `fetch` for the whole project,
// which conflicts with the Node-targeted CLI code.
declare module "bun:test" {
  type Hook = () => void | Promise<void>;
  export function test(name: string, run: () => void | Promise<void>): void;
  export function beforeAll(run: Hook): void;
  export function afterEach(run: Hook): void;
  interface Matchers {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toContain(expected: string): void;
    toBeUndefined(): void;
  }
  export function expect<T>(actual: T): Matchers & { not: Matchers };
}
