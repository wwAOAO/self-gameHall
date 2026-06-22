import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

interface BestMoveRequest {
    sfen?: string;
    movetime?: number;
    depth?: number;
}

interface EngineLookup {
    enginePath: string | null;
    checkedPaths: string[];
}

interface PendingSearch {
    resolve: (move: string | null) => void;
    timeout: ReturnType<typeof setTimeout>;
}

const DEFAULT_MOVE_TIME = 900;

class YaneuraOuUsi {
    private process: ChildProcessWithoutNullStreams | null = null;
    private readyPromise: Promise<void> | null = null;
    private pending: PendingSearch | null = null;
    private queue: Promise<string | null> = Promise.resolve(null);

    constructor(private executable: string) {}

    search(sfen: string, movetime = DEFAULT_MOVE_TIME, depth?: number): Promise<string | null> {
        this.queue = this.queue.then(
            () => this.runSearch(sfen, movetime, depth),
            () => this.runSearch(sfen, movetime, depth),
        );
        return this.queue;
    }

    dispose() {
        if (this.pending) {
            clearTimeout(this.pending.timeout);
            this.pending.resolve(null);
            this.pending = null;
        }
        this.process?.kill();
        this.process = null;
        this.readyPromise = null;
    }

    private async runSearch(sfen: string, movetime: number, depth?: number): Promise<string | null> {
        await this.ensureReady();
        const engine = this.process;
        if (!engine) return null;

        return new Promise<string | null>(resolve => {
            const timeout = setTimeout(
                () => {
                    if (this.pending?.resolve === resolve) this.pending = null;
                    try {
                        engine.stdin.write('stop\n');
                    } catch {
                        // Ignore a dead engine; the caller can keep the current game state.
                    }
                    resolve(null);
                },
                Math.max(3000, movetime + 2200),
            );

            this.pending = { resolve, timeout };
            engine.stdin.write('usinewgame\n');
            engine.stdin.write(`position sfen ${sfen}\n`);
            engine.stdin.write(depth ? `go depth ${depth}\n` : `go movetime ${Math.max(100, Math.floor(movetime))}\n`);
        });
    }

    private ensureReady(): Promise<void> {
        if (this.readyPromise) return this.readyPromise;

        this.readyPromise = new Promise((resolve, reject) => {
            const engine = spawn(this.executable, [], { cwd: path.dirname(this.executable), stdio: 'pipe' });
            this.process = engine;

            const startupTimeout = setTimeout(() => reject(new Error('YaneuraOu startup timed out')), 9000);

            engine.stdout.setEncoding('utf8');
            engine.stdout.on('data', chunk => {
                for (const line of chunk.split(/\r?\n/)) {
                    const text = line.trim();
                    if (!text) continue;

                    if (text === 'usiok') {
                        engine.stdin.write('setoption name BookFile value no_book\n');
                        engine.stdin.write('isready\n');
                    } else if (text === 'readyok') {
                        clearTimeout(startupTimeout);
                        resolve();
                    } else if (text.startsWith('bestmove ')) {
                        const move = text.split(/\s+/)[1];
                        const pending = this.pending;
                        if (pending) {
                            clearTimeout(pending.timeout);
                            this.pending = null;
                            pending.resolve(move && move !== 'resign' && move !== 'win' ? move : null);
                        }
                    }
                }
            });

            engine.stderr.setEncoding('utf8');
            engine.on('error', reject);
            engine.on('exit', () => {
                this.process = null;
                this.readyPromise = null;
                if (this.pending) {
                    clearTimeout(this.pending.timeout);
                    this.pending.resolve(null);
                    this.pending = null;
                }
            });

            engine.stdin.write('usi\n');
        });

        return this.readyPromise;
    }
}

function findYaneuraOuInDir(dir: string, checkedPaths: string[]): string | null {
    if (!fs.existsSync(dir)) {
        checkedPaths.push(dir);
        return null;
    }

    const names = fs.readdirSync(dir);
    const executableNames =
        process.platform === 'win32'
            ? ['YaneuraOu.exe', 'yaneuraou.exe', 'YaneuraOu-by-gcc.exe']
            : ['YaneuraOu', 'yaneuraou'];

    for (const name of executableNames) {
        const exact = path.resolve(dir, name);
        checkedPaths.push(exact);
        if (fs.existsSync(exact) && fs.statSync(exact).isFile()) return exact;
    }

    const candidates = names
        .filter(name => /yaneura|やねうら/i.test(name))
        .filter(name => (process.platform === 'win32' ? name.toLowerCase().endsWith('.exe') : true))
        .map(name => path.resolve(dir, name));

    checkedPaths.push(...candidates);
    return candidates.find(candidate => fs.statSync(candidate).isFile()) ?? null;
}

function findEnginePath(root: string): EngineLookup {
    const checkedPaths: string[] = [];
    const envPath = process.env.YANEURAOU_EXECUTABLE;
    if (envPath) {
        checkedPaths.push(envPath);
        if (fs.existsSync(envPath)) return { enginePath: envPath, checkedPaths };
    }

    const searchDirs = [
        path.resolve(root, 'engines', 'yaneuraou'),
        path.resolve(root, 'engines', 'YaneuraOu'),
        path.resolve(process.cwd(), 'engines', 'yaneuraou'),
        path.resolve(process.cwd(), 'engines', 'YaneuraOu'),
    ];

    for (const dir of searchDirs) {
        const enginePath = findYaneuraOuInDir(dir, checkedPaths);
        if (enginePath) return { enginePath, checkedPaths };
    }

    return { enginePath: null, checkedPaths };
}

function findMissingRequiredFiles(enginePath: string | null) {
    if (!enginePath) return [];
    const engineDir = path.dirname(enginePath);
    const modelPath = path.resolve(engineDir, 'eval', 'model.onnx');
    return fs.existsSync(modelPath) ? [] : [modelPath];
}

function readJsonBody(req: import('node:http').IncomingMessage): Promise<BestMoveRequest> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 16_384) {
                reject(new Error('Request body is too large'));
                req.destroy();
            }
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });
}

function attachYaneuraOuApi(
    root: string,
    middlewares: { use: (path: string, handler: import('node:http').RequestListener) => void },
) {
    const { enginePath, checkedPaths } = findEnginePath(root);
    let engine: YaneuraOuUsi | null = null;

    function getEngine() {
        const missingFiles = findMissingRequiredFiles(enginePath);
        if (!enginePath || missingFiles.length > 0) return { engine: null, missingFiles };
        engine ??= new YaneuraOuUsi(enginePath);
        return { engine, missingFiles };
    }

    middlewares.use('/api/yaneuraou/status', (_req, res) => {
        const state = getEngine();
        res.setHeader('Content-Type', 'application/json');
        res.end(
            JSON.stringify({
                available: !!enginePath && state.missingFiles.length === 0,
                enginePath,
                checkedPaths,
                missingFiles: state.missingFiles,
            }),
        );
    });

    middlewares.use('/api/yaneuraou/bestmove', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');

        if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end(JSON.stringify({ ok: false, error: 'POST only' }));
            return;
        }

        if (!enginePath) {
            res.statusCode = 503;
            res.end(JSON.stringify({ ok: false, error: 'YaneuraOu executable not found', enginePath, checkedPaths }));
            return;
        }

        const state = getEngine();
        if (state.missingFiles.length > 0) {
            res.statusCode = 503;
            res.end(
                JSON.stringify({
                    ok: false,
                    error: `Missing YaneuraOu model file: ${state.missingFiles[0]}`,
                    enginePath,
                    missingFiles: state.missingFiles,
                }),
            );
            return;
        }

        if (!state.engine) {
            res.statusCode = 503;
            res.end(JSON.stringify({ ok: false, error: 'YaneuraOu engine is not available', enginePath }));
            return;
        }

        try {
            const body = await readJsonBody(req);
            if (!body.sfen) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: 'Missing sfen' }));
                return;
            }

            const bestmove = await state.engine.search(body.sfen, body.movetime, body.depth);
            res.end(JSON.stringify({ ok: !!bestmove, bestmove, enginePath }));
        } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
        }
    });

    return () => engine?.dispose();
}

export function yaneuraouPlugin(): Plugin {
    let root = process.cwd();

    return {
        name: 'gamehall-yaneuraou',
        configResolved(config) {
            root = config.root;
        },
        configureServer(server) {
            const dispose = attachYaneuraOuApi(root, server.middlewares);
            server.httpServer?.once('close', dispose);
        },
        configurePreviewServer(server) {
            return () => {
                const dispose = attachYaneuraOuApi(root, server.middlewares);
                server.httpServer?.once('close', dispose);
            };
        },
    };
}
