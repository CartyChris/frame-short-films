import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['tests/**/*.test.ts','integrations/tests/**/*.test.ts'],environment:'node',maxWorkers:2}});
