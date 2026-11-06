import { mkdir, cp } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const files = ['index.html', 'privacy.html', 'analytics-config.js', 'analytics.js', 'analytics.css', 'styles.css', 'sections.css', 'site-layout.css', 'booking-modal.css', 'preloader.css', 'footer.css', 'script.js', 'assets', 'admin'];
await mkdir(path.join(root, 'dist'), { recursive: true });
for (const file of files) await cp(path.join(root, file), path.join(root, 'dist', file), { recursive: true });
console.log('Built public website and dashboard UI in dist/. Server files and secrets are excluded.');
