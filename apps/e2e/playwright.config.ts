import { defineConfig, devices } from '@playwright/test';

const porta = process.env.E2E_PORTA ?? '3400';

/**
 * Testes de ponta a ponta no navegador (docs/testes-navegador.md). Um servidor só (API +
 * site compilado), banco próprio recriado a cada rodada, e-mails reais pelo Mailpit.
 */
export default defineConfig({
  testDir: './testes',
  // Um teste por vez: eles compartilham o banco e o limite de requisições da API.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${porta}`,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'computador', use: { ...devices['Desktop Chrome'] }, testIgnore: /celular\.spec/ },
    { name: 'celular', use: { ...devices['Pixel 7'] }, testMatch: /celular\.spec/ },
  ],
  webServer: {
    command: 'node servidor.mjs',
    url: `http://127.0.0.1:${porta}/v1/saude`,
    timeout: 90_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
