import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

const ROM_EXTENSIONS = new Set(['.gba']);
const ROM_PUBLIC_BASE = '/roms/gba';
const ACCENTS = [
    'from-violet-300 to-cyan-500',
    'from-rose-300 to-amber-400',
    'from-sky-300 to-blue-500',
    'from-lime-300 to-teal-500',
    'from-fuchsia-300 to-violet-500',
    'from-orange-300 to-red-500',
];

interface RomManifestEntry {
    id: string;
    name: string;
    desc: string;
    tag: string;
    format: string;
    romPath: string;
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

function displayName(filePath: string) {
    return path.basename(filePath, path.extname(filePath)).replace(/[_-]+/g, ' ').trim();
}

function getRomRoot(root: string) {
    return path.resolve(root, 'public', 'roms', 'gba');
}

function listRomFiles(root: string) {
    const romRoot = getRomRoot(root);
    return walkFiles(romRoot)
        .filter(file => ROM_EXTENSIONS.has(path.extname(file).toLowerCase()))
        .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

function getRomId(relativePath: string) {
    return `rom-${crypto.createHash('sha1').update(`gba/${relativePath}`).digest('hex').slice(0, 10)}`;
}

function buildManifest(root: string): RomManifestEntry[] {
    const romRoot = getRomRoot(root);

    return listRomFiles(root).map((file, index) => {
        const relativePath = path.relative(romRoot, file);

        return {
            id: getRomId(relativePath),
            name: displayName(file),
            desc: 'GBA ROM 文件，可直接载入游玩。',
            tag: 'GBA',
            format: 'Game Boy Advance',
            romPath: publicRomUrl(relativePath),
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

export function gbaRomManifestPlugin(): Plugin {
    let root = process.cwd();

    return {
        name: 'gamehall-gba-rom-manifest',
        configResolved(config) {
            root = config.root;
            writeManifest(root);
        },
        buildStart() {
            writeManifest(root);
        },
        configureServer(server) {
            writeManifest(root);
            const romRoot = getRomRoot(root);
            server.watcher.add(romRoot);
            server.watcher.on('all', (_event, changedPath) => {
                if (changedPath.startsWith(romRoot)) writeManifest(root);
            });
        },
        configurePreviewServer() {
            return () => writeManifest(root);
        },
    };
}
