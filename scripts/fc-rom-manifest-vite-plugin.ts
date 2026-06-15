import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import JSZip from 'jszip';

const ROM_EXTENSIONS = new Set(['.nes', '.zip']);
const ROM_PUBLIC_BASE = '/roms/fc';
const API_BASE = '/api/fc-rom';
const ACCENTS = [
    'from-cyan-300 to-emerald-500',
    'from-amber-300 to-red-500',
    'from-sky-300 to-blue-500',
    'from-lime-300 to-teal-500',
    'from-fuchsia-300 to-violet-500',
    'from-rose-300 to-orange-500',
];

interface RomManifestEntry {
    id: string;
    name: string;
    desc: string;
    tag: string;
    mapper: string;
    romPath: string;
    loadUrl: string;
    fileName: string;
    accent: string;
}

function walkFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];

    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) return walkFiles(fullPath);
        return entry.isFile() ? [fullPath] : [];
    });
}

function publicRomUrl(relativePath: string) {
    return `${ROM_PUBLIC_BASE}/${relativePath.split(path.sep).map(encodeURIComponent).join('/')}`;
}

function apiRomUrl(id: string, relativePath: string) {
    const parsed = path.parse(relativePath);
    const fileName = parsed.ext.toLowerCase() === '.zip' ? `${parsed.name}.nes` : path.basename(relativePath);
    return `${API_BASE}/${id}/${encodeURIComponent(fileName)}`;
}

function displayName(filePath: string) {
    return path.basename(filePath, path.extname(filePath)).replace(/[_-]+/g, ' ').trim();
}

function getRomRoot(root: string) {
    return path.resolve(root, 'public', 'roms', 'fc');
}

function listRomFiles(root: string) {
    const romRoot = getRomRoot(root);
    return walkFiles(romRoot)
        .filter(file => ROM_EXTENSIONS.has(path.extname(file).toLowerCase()))
        .filter(file => path.basename(file).toLowerCase() !== 'manifest.json')
        .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

function getRomId(relativePath: string) {
    return `rom-${crypto.createHash('sha1').update(`fc/${relativePath}`).digest('hex').slice(0, 10)}`;
}

function buildManifest(root: string): RomManifestEntry[] {
    const romRoot = getRomRoot(root);

    return listRomFiles(root).map((file, index) => {
        const relativePath = path.relative(romRoot, file);
        const extension = path.extname(file).toLowerCase();
        const id = getRomId(relativePath);

        return {
            id,
            name: displayName(file),
            desc:
                extension === '.zip'
                    ? 'ZIP 卡带包，进入后会自动读取其中的 .nes 文件。'
                    : 'NES ROM 文件，可直接载入游玩。',
            tag: extension === '.zip' ? 'ZIP' : 'NES',
            mapper: 'iNES / 自动载入',
            romPath: publicRomUrl(relativePath),
            loadUrl: apiRomUrl(id, relativePath),
            fileName: path.basename(relativePath),
            accent: ACCENTS[index % ACCENTS.length],
        };
    });
}

function writeManifest(root: string) {
    const romRoot = getRomRoot(root);
    fs.mkdirSync(romRoot, { recursive: true });
    fs.writeFileSync(path.join(romRoot, 'manifest.json'), `${JSON.stringify(buildManifest(root), null, 2)}\n`, 'utf8');
}

function getContentType(filePath: string) {
    const extension = path.extname(filePath).toLowerCase();
    if (extension === '.zip') return 'application/zip';
    if (extension === '.nes') return 'application/octet-stream';
    return 'application/octet-stream';
}

function attachFcRomApi(
    root: string,
    middlewares: { use: (path: string, handler: import('node:http').RequestListener) => void },
) {
    middlewares.use(API_BASE, async (req, res) => {
        const requestPath = (req.url ?? '').split('?')[0].replace(/^\/+/, '');
        const id = requestPath.split('/')[0];
        const romRoot = getRomRoot(root);
        const romFile = listRomFiles(root).find(file => getRomId(path.relative(romRoot, file)) === id);

        if (!romFile) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: 'FC ROM not found' }));
            return;
        }

        if (path.extname(romFile).toLowerCase() === '.zip') {
            try {
                const zip = await JSZip.loadAsync(fs.readFileSync(romFile));
                const nesEntry = Object.values(zip.files)
                    .filter(file => !file.dir && file.name.toLowerCase().endsWith('.nes'))
                    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))[0];

                if (!nesEntry) {
                    res.statusCode = 422;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ ok: false, error: 'No .nes file found in zip' }));
                    return;
                }

                const data = await nesEntry.async('nodebuffer');
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/octet-stream');
                res.setHeader('Content-Length', String(data.length));
                res.setHeader('Cache-Control', 'no-store');
                res.end(data);
                return;
            } catch {
                res.statusCode = 422;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: false, error: 'Invalid FC zip file' }));
                return;
            }
        }

        const stat = fs.statSync(romFile);
        res.statusCode = 200;
        res.setHeader('Content-Type', getContentType(romFile));
        res.setHeader('Content-Length', String(stat.size));
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(romFile).pipe(res);
    });
}

export function fcRomManifestPlugin(): Plugin {
    let root = process.cwd();

    return {
        name: 'gamehall-fc-rom-manifest',
        configResolved(config) {
            root = config.root;
            writeManifest(root);
        },
        buildStart() {
            writeManifest(root);
        },
        configureServer(server) {
            writeManifest(root);
            attachFcRomApi(root, server.middlewares);
            const romRoot = getRomRoot(root);
            server.watcher.add(romRoot);
            server.watcher.on('all', (_event, changedPath) => {
                if (changedPath.startsWith(romRoot)) writeManifest(root);
            });
        },
        configurePreviewServer(server) {
            return () => {
                writeManifest(root);
                attachFcRomApi(root, server.middlewares);
            };
        },
    };
}
