import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Thin native shell: the APK loads the server-rendered web app from the EU deployment.
 * All business logic stays on the server; the shell only adds camera access + app icon.
 * Set APP_URL at build time, e.g. APP_URL=https://receipts.example.eu npm run apk:debug
 */
const appUrl = process.env.APP_URL ?? 'https://your-app.vercel.app';

const config: CapacitorConfig = {
  appId: 'eu.tallyo.app',
  appName: 'Tallyo',
  webDir: 'www',
  server: {
    url: appUrl,
    cleartext: false,
    allowNavigation: [new URL(appUrl).host, '*.enablebanking.com'],
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
