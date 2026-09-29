import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  // bundle internal workspace packages (they ship TypeScript source)
  noExternal: [/^@es\//],
  // keep third-party deps (incl. those of @es/service-kit) as runtime requires
  external: ['fastify', /^@fastify\//, /^@supabase\//, 'zod', 'sharp'],
  clean: true,
});
