import {build as esbuild,type BuildOptions,type BuildResult} from 'esbuild';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);

/** Browser fixture bundles keep Emscripten's unreachable Node loader external.
 * The actual WASM/browser implementation is still bundled and executed. If a
 * fixture enters a Node branch in the browser, it fails instead of receiving a stub.
 * This mirrors Vite's Node-builtin externalization without changing production code. */
export function build<T extends BuildOptions>(options:T):Promise<BuildResult<T>>{
 // Use Lucide's real single-file distribution to avoid traversing thousands of
 // individual icon modules for every browser fixture. Caller aliases still win.
 return esbuild({...options,alias:{'lucide-react':require.resolve('lucide-react'),...options.alias},external:['node:*',...(options.external||[])]} as T);
}
