import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

interface BestMoveRequest {
    fen?: string;
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

class StockfishUci {
    private process: ChildProcessWithoutNullStreams | null = null;
    private readyPromise: Promise<void> | null = null;
    private pending: PendingSearch | null = null;
    private queue: Promise<string | null> = Promise.resolve(null);

    constructor(private executable: string) {}

    search(fen: string, movetime = DEFAULT_MOVE_TIME, depth?: number): Promise<string | null> {
        this.queue = this.queue.then(
            () => this.runSearch(fen, movetime, depth),
            () => this.runSearch(fen, movetime, depth),
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

    private async runSearch(fen: string, movetime: number, depth?: number): Promise<string | null> {
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
                        // Ignore a dead engine; the caller will use the built-in AI.
                    }
                    resolve(null);
                },
                Math.max(2500, movetime + 1800),
            );

            this.pending = { resolve, timeout };
            engine.stdin.write('ucinewgame\n');
            engine.stdin.write(`position fen ${fen}\n`);
            engine.stdin.write(depth ? `go depth ${depth}\n` : `go movetime ${Math.max(100, Math.floor(movetime))}\n`);
        });
    }

    private ensureReady(): Promise<void> {
        if (this.readyPromise) return this.readyPromise;

        this.readyPromise = new Promise((resolve, reject) => {
            const engine = spawn(this.executable, [], { cwd: path.dirname(this.executable), stdio: 'pipe' });
            this.process = engine;

            const startupTimeout = setTimeout(() => reject(new Error('Stockfish startup timed out')), 7000);

            engine.stdout.setEncoding('utf8');
            engine.stdout.on('data', chunk => {
                for (const line of chunk.split(/\r?\n/)) {
                    const text = line.trim();
                    if (!text) continue;

                    if (text === 'uciok') {
                        engine.stdin.write('setoption name Threads value 1\n');
                        engine.stdin.write('setoption name Hash value 32\n');
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
                            pending.resolve(move && move !== '(none)' ? move : null);
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

            engine.stdin.write('uci\n');
        });

        return this.readyPromise;
    }
}

function findStockfishInDir(dir: string, checkedPaths: string[]): string | null {
    if (!fs.existsSync(dir)) {
        checkedPaths.push(dir);
        return null;
    }

    const names = fs.readdirSync(dir);
    const exactName = process.platform === 'win32' ? 'stockfish.exe' : 'stockfish';
    const exact = path.resolve(dir, exactName);
    checkedPaths.push(exact);
    if (fs.existsSync(exact)) return exact;

    const candidates = names
        .filter(name => name.toLowerCase().includes('stockfish'))
        .filter(name => (process.platform === 'win32' ? name.toLowerCase().endsWith('.exe') : true))
        .map(name => path.resolve(dir, name));

    checkedPaths.push(...candidates);
    return candidates.find(candidate => fs.statSync(candidate).isFile()) ?? null;
}

function findEnginePath(root: string): EngineLookup {
    const checkedPaths: string[] = [];
    const envPath = process.env.STOCKFISH_EXECUTABLE;
    if (envPath) {
        checkedPaths.push(envPath);
        if (fs.existsSync(envPath)) return { enginePath: envPath, checkedPaths };
    }

    const searchDirs = [
        path.resolve(root, 'engines', 'stockfish'),
        path.resolve(process.cwd(), 'engines', 'stockfish'),
    ];

    for (const dir of searchDirs) {
        const enginePath = findStockfishInDir(dir, checkedPaths);
        if (enginePath) return { enginePath, checkedPaths };
    }

    return { enginePath: null, checkedPaths };
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

function attachStockfishApi(
    root: string,
    middlewares: { use: (path: string, handler: import('node:http').RequestListener) => void },
) {
    const { enginePath, checkedPaths } = findEnginePath(root);
    const engine = enginePath ? new StockfishUci(enginePath) : null;

    middlewares.use('/api/stockfish/status', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ available: !!enginePath, enginePath, checkedPaths }));
    });

    middlewares.use('/api/stockfish/bestmove', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');

        if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end(JSON.stringify({ ok: false, error: 'POST only' }));
            return;
        }

        if (!engine) {
            res.statusCode = 503;
            res.end(JSON.stringify({ ok: false, error: 'Stockfish executable not found', enginePath }));
            return;
        }

        try {
            const body = await readJsonBody(req);
            if (!body.fen) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: 'Missing fen' }));
                return;
            }

            const bestmove = await engine.search(body.fen, body.movetime, body.depth);
            res.end(JSON.stringify({ ok: !!bestmove, bestmove, enginePath }));
        } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
        }
    });

    return () => engine?.dispose();
}

export function stockfishPlugin(): Plugin {
    let root = process.cwd();

    return {
        name: 'gamehall-stockfish',
        configResolved(config) {
            root = config.root;
        },
        configureServer(server) {
            const dispose = attachStockfishApi(root, server.middlewares);
            server.httpServer?.once('close', dispose);
        },
        configurePreviewServer(server) {
            return () => {
                const dispose = attachStockfishApi(root, server.middlewares);
                server.httpServer?.once('close', dispose);
            };
        },
    };
}
