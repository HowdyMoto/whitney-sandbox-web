import { defineConfig } from 'vite';
import path from 'path';
import type { Plugin } from 'vite';

// Plugin to serve the native app's instrument samples during dev
function serveInstruments(): Plugin {
  const instrumentsDir = path.resolve(__dirname, '../bin/data/instruments');
  return {
    name: 'serve-instruments',
    configureServer(server) {
      server.middlewares.use('/instruments', (req, res, next) => {
        // Rewrite to serve from native app's data directory
        const filePath = path.join(instrumentsDir, req.url || '');
        import('fs').then(fs => {
          if (fs.existsSync(filePath)) {
            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes: Record<string, string> = {
              '.mp3': 'audio/mpeg',
              '.toml': 'text/plain',
            };
            res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
            fs.createReadStream(filePath).pipe(res);
          } else {
            next();
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [serveInstruments()],
  server: {
    fs: {
      allow: [
        path.resolve(__dirname, '../bin/data/instruments'),
        path.resolve(__dirname),
      ],
    },
  },
});
