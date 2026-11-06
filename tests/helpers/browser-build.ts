import {build as esbuild,type BuildOptions,type BuildResult} from 'esbuild';

/** Browser fixture bundles keep Emscripten's unreachable Node loader external.
 * The actual WASM/browser implementation is still bundled and executed. If a
 * fixture enters a Node branch in the browser, it fails instead of receiving a stub.
 * This mirrors Vite's Node-builtin externalization without changing production code. */
export function build<T extends BuildOptions>(options:T):Promise<BuildResult<T>>{
 return esbuild({...options,external:['node:*',...(options.external||[])]} as T);
}
