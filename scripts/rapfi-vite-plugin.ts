import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

type Stone = 1 | 2;

interface RapfiMove {
    row: number;
    col: number;
    player: Stone;
}

interface BestMoveRequest {
    moves?: RapfiMove[];
    side?: Stone;
    timeMs?: number;
}

interface PendingSearch {
    resolve: (move: { row: number; col: number } | null) => void;
    timeout: ReturnType<typeof setTimeout>;
}

const BOARD_SIZE = 15;
const DEFAULT_MOVE_TIME = 1200;

class RapfiPiskvork {
    private process: ChildProcessWithoutNullStreams | null = null;
    private readyPromise: Promise<void> | null = null;
    private pending: PendingSearch | null = null;
    private queue: Promise<{ row: number; col: number } | null> = Promise.resolve(null);

    constructor(private executable: string) {}

    search(moves: RapfiMove[], timeMs = DEFAULT_MOVE_TIME): Promise<{ row: number; col: number } | null> {
        this.queue = this.queue.then(
            () => this.runSearch(moves, timeMs),
            () => this.runSearch(moves, timeMs),
        );
        return this.queue;
    }

    dispose() {
        if (this.pending) {
            clearTimeout(this.pending.timeout);
            this.pending.resolve(null);
            this.pending = null;
        }
        try {
            this.process?.stdin.write('END\n');
        } catch {
            // The process may already be gone.
        }
        this.process?.kill();
        this.process = null;
        this.readyPromise = null;
    }

    private async runSearch(moves: RapfiMove[], timeMs: number): Promise<{ row: number; col: number } | null> {
        await this.ensureReady(timeMs);
        const engine = this.process;
        if (!engine) return null;

        return new Promise(resolve => {
            const timeout = setTimeout(
                () => {
                    if (this.pending?.resolve === resolve) this.pending = null;
                    try {
                        engine.stdin.write('STOP\n');
                    } catch {
                        // Ignore a dead engine; the caller will use the built-in AI.
                    }
                    resolve(null);
                },
                Math.max(2500, timeMs + 1800),
            );

            this.pending = { resolve, timeout };
            engine.stdin.write('BOARD\n');
            for (const move of moves) {
                engine.stdin.write(`${move.col},${move.row},${move.player}\n`);
            }
            engine.stdin.write('DONE\n');
        });
    }

    private ensureReady(timeMs: number): Promise<void> {
        if (this.readyPromise) return this.readyPromise;

        this.readyPromise = new Promise((resolve, reject) => {
            const engine = spawn(this.executable, [], { cwd: path.dirname(this.executable), stdio: 'pipe' });
            this.process = engine;

            const startupTimeout = setTimeout(() => reject(new Error('Rapfi startup timed out')), 5000);

            engine.stdout.setEncoding('utf8');
            engine.stdout.on('data', chunk => {
                for (const line of chunk.split(/\r?\n/)) {
                    const text = line.trim();
                    if (!text) continue;

                    const match = text.match(/^(\d+),(\d+)$/);
                    if (match) {
                        const col = Number(match[1]);
                        const row = Number(match[2]);
                        const pending = this.pending;
                        if (pending) {
                            clearTimeout(pending.timeout);
                            this.pending = null;
                            pending.resolve(isValidCoord(row, col) ? { row, col } : null);
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

            engine.stdin.write(`START ${BOARD_SIZE}\n`);
            engine.stdin.write(`INFO timeout_turn ${Math.max(100, Math.floor(timeMs))}\n`);
            clearTimeout(startupTimeout);
            resolve();
        });

        return this.readyPromise;
    }
}

function isValidCoord(row: number, col: number): boolean {
    return (
        Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE
    );
}

function normalizeMoves(input: unknown): RapfiMove[] | null {
    if (!Array.isArray(input)) return null;

    const moves: RapfiMove[] = [];
    for (const item of input) {
        if (!item || typeof item !== 'object') return null;
        const move = item as Partial<RapfiMove>;
        if (!isValidCoord(Number(move.row), Number(move.col))) return null;
        if (move.player !== 1 && move.player !== 2) return null;
        moves.push({ row: Number(move.row), col: Number(move.col), player: move.player });
    }
    return moves;
}

function findEnginePath(root: string): string | null {
    const rapfiDir = path.resolve(root, 'engines', 'rapfi');
    const enginePaths = [
        process.env.RAPFI_EXECUTABLE,
        path.resolve(rapfiDir, process.platform === 'win32' ? 'rapfi.exe' : 'rapfi'),
        path.resolve(rapfiDir, process.platform === 'win32' ? 'pbrain-rapfi.exe' : 'pbrain-rapfi'),
        ...(process.platform === 'win32'
            ? [
                  path.resolve(rapfiDir, 'pbrain-rapfi-windows-avx2.exe'),
                  path.resolve(rapfiDir, 'pbrain-rapfi-windows-sse.exe'),
                  path.resolve(rapfiDir, 'pbrain-rapfi-windows-avxvnni.exe'),
                  path.resolve(rapfiDir, 'pbrain-rapfi-windows-avx512.exe'),
                  path.resolve(rapfiDir, 'pbrain-rapfi-windows-avx512vnni.exe'),
              ]
            : [
                  path.resolve(rapfiDir, 'pbrain-rapfi-linux-clang-avx2'),
                  path.resolve(rapfiDir, 'pbrain-rapfi-linux-clang-sse'),
                  path.resolve(rapfiDir, 'pbrain-rapfi-macos-apple-silicon'),
              ]),
    ].filter(Boolean) as string[];

    return enginePaths.find(candidate => candidate && fs.existsSync(candidate)) ?? null;
}

function readJsonBody(req: import('node:http').IncomingMessage): Promise<BestMoveRequest> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 64_000) {
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

function attachRapfiApi(
    root: string,
    middlewares: { use: (path: string, handler: import('node:http').RequestListener) => void },
) {
    const enginePath = findEnginePath(root);
    const engine = enginePath ? new RapfiPiskvork(enginePath) : null;

    middlewares.use('/api/rapfi/status', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ available: !!enginePath, enginePath }));
    });

    middlewares.use('/api/rapfi/bestmove', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');

        if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end(JSON.stringify({ ok: false, error: 'POST only' }));
            return;
        }

        if (!engine) {
            res.statusCode = 503;
            res.end(JSON.stringify({ ok: false, error: 'Rapfi executable not found', enginePath }));
            return;
        }

        try {
            const body = await readJsonBody(req);
            const moves = normalizeMoves(body.moves);
            if (!moves) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: 'Missing or invalid moves' }));
                return;
            }

            const bestmove = await engine.search(moves, body.timeMs);
            res.end(JSON.stringify({ ok: !!bestmove, bestmove, enginePath }));
        } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
        }
    });

    return () => engine?.dispose();
}

export function rapfiPlugin(): Plugin {
    let root = process.cwd();

    return {
        name: 'gamehall-rapfi',
        configResolved(config) {
            root = config.root;
        },
        configureServer(server) {
            const dispose = attachRapfiApi(root, server.middlewares);
            server.httpServer?.once('close', dispose);
        },
        configurePreviewServer(server) {
            return () => {
                const dispose = attachRapfiApi(root, server.middlewares);
                server.httpServer?.once('close', dispose);
            };
        },
    };
}
