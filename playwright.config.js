const {defineConfig} = require('@playwright/test');

module.exports = defineConfig({
    testDir: 'test/e2e',
    timeout: 60000,
    use: {
        baseURL: 'http://localhost:8901',
        trace: 'retain-on-failure',
    },
    webServer: {
        command: 'python3 -m http.server 8901 --directory dist',
        url: 'http://localhost:8901',
        reuseExistingServer: true,
        timeout: 30000,
    },
    projects: [
        {name: 'chromium', use: {browserName: 'chromium'}},
    ],
});
