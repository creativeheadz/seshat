import {defineConfig} from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/unit/**/*.test.js'],
        testTimeout: 30000,
        // One worker: the AMD loader keeps global state.
        poolOptions: {
            threads: {singleThread: true},
        },
    },
});
