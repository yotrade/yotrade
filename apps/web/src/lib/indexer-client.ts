import { publicEnv } from "./env.ts";
import { createIndexer } from "./indexer.ts";

export const indexer = createIndexer(publicEnv.NEXT_PUBLIC_INDEXER_URL);
