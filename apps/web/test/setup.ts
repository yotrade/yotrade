// `lib/env.ts` parses the public environment when it loads, and a real app always has an indexer endpoint. Tests
// get a placeholder one, so importing a module that reads it never fails before the test runs. Tests that check
// the variable itself call `parsePublicEnv` with their own values.
process.env["NEXT_PUBLIC_INDEXER_URL"] ||= "https://indexer.test/v1/graphql";
