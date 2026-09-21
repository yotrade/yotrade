import { type Chain, createPublicClient, http, type PublicClient, type Transport } from "viem";

/** What every plugin receives: the chain and one shared public client. */
export interface PluginContext {
  readonly chain: Chain;
  readonly publicClient: PublicClient;
}

/** A named factory that turns the shared context into a typed API. */
export interface Plugin<TName extends string = string, TApi = unknown> {
  readonly name: TName;
  readonly setup: (context: PluginContext) => TApi;
}

export function definePlugin<const TName extends string, TApi>(
  name: TName,
  setup: (context: PluginContext) => TApi,
): Plugin<TName, TApi> {
  return { name, setup };
}

type PluginApis<TPlugins extends readonly Plugin[]> = {
  readonly [P in TPlugins[number] as P["name"]]: ReturnType<P["setup"]>;
};

/** The shared context plus one property per plugin, keyed by plugin name. */
export type Runtime<TPlugins extends readonly Plugin[]> = PluginContext & PluginApis<TPlugins>;

export interface RuntimeOptions<TPlugins extends readonly Plugin[]> {
  readonly chain: Chain;
  /** Defaults to the chain's public RPC. Pass a provider transport (for example Alchemy) to replace it. */
  readonly transport?: Transport;
  readonly plugins: TPlugins;
}

const RESERVED_NAMES: ReadonlySet<string> = new Set(["chain", "publicClient"]);

export function createRuntime<const TPlugins extends readonly Plugin[]>(
  options: RuntimeOptions<TPlugins>,
): Runtime<TPlugins> {
  const context: PluginContext = {
    chain: options.chain,
    publicClient: createPublicClient({
      chain: options.chain,
      transport: options.transport ?? http(),
    }),
  };

  const apis = new Map<string, unknown>();
  for (const plugin of options.plugins) {
    if (RESERVED_NAMES.has(plugin.name) || apis.has(plugin.name)) {
      throw new Error(`Plugin name "${plugin.name}" is reserved or registered twice`);
    }
    apis.set(plugin.name, plugin.setup(context));
  }

  return Object.freeze({ ...context, ...Object.fromEntries(apis) }) as Runtime<TPlugins>;
}
