import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDataDir = path.join(root, 'public', 'emulatorjs', 'data');
const emulatorDataDir = path.join(root, 'node_modules', '@emulatorjs', 'emulatorjs', 'data');
const corePackages = ['core-fceumm', 'core-nestopia', 'core-mgba'];

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else if (entry.isFile()) {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

copyDir(emulatorDataDir, publicDataDir);

const coresDir = path.join(publicDataDir, 'cores');
fs.mkdirSync(coresDir, { recursive: true });

for (const packageName of corePackages) {
    const coreDir = path.join(root, 'node_modules', '@emulatorjs', packageName);
    for (const entry of fs.readdirSync(coreDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            copyDir(path.join(coreDir, entry.name), path.join(coresDir, entry.name));
        } else if (entry.isFile()) {
            fs.copyFileSync(path.join(coreDir, entry.name), path.join(coresDir, entry.name));
        }
    }
}

console.log(`Synced EmulatorJS assets to ${path.relative(root, publicDataDir)}`);
