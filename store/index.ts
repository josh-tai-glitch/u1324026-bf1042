import { PgStore } from "./pg/PgStore.ts";
import type { Store } from "./Store.ts";

export function createStore(): Store {
  return new PgStore();
}

export type { Store } from "./Store.ts";
