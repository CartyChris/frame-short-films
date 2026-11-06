import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['integrations/tests/**/*.test.ts'],environment:'node'}});
