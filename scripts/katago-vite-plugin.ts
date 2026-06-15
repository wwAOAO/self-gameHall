import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

type Stone = 1 | 2;

interface GoMove {
    row?: number;
    col?: number;
    player: Stone;
    pass?: boolean;
}

interface BestMoveRequest {
    moves?: GoMove[];
    side?: Stone;
    timeMs?: number;
    komi?: number;
    boardSize?: number;
}

interface PendingCommand {
    resolve: (response: GtpResponse) => void;
    timeout: ReturnType<typeof setTimeout>;
    lines: string[];
}

interface GtpResponse {
    ok: boolean;
    text: string;
}

interface KataGoLaunch {
    executable: string;
    args: string[];
    enginePath: string;
    modelPath: string | null;
    configPath: string | null;
}

const BOARD_SIZE = 19;
const DEFAULT_MOVE_TIME = 1200;
const STARTUP_TIMEOUT_MS = 180_000;
const GTP_COLUMNS = 'ABCDEFGHJKLMNOPQRST';

class KataGoGtp {
    private process: ChildProcessWithoutNullStreams | null = null;
    private readyPromise: Promise<void> | null = null;
    private pending: PendingCommand | null = null;
    private stdoutBuffer = '';
    private stderrTail = '';
    private lastError = '';
    private queue: Promise<{ row: number; col: number; pass?: boolean } | null> = Promise.resolve(null);

    constructor(private launch: KataGoLaunch) {}

    getLastError(): string {
        return this.lastError || this.stderrTail;
    }

    search(
        moves: GoMove[],
        side: Stone,
        timeMs = DEFAULT_MOVE_TIME,
        komi = 0,
        boardSize = BOARD_SIZE,
    ): Promise<{ row: number; col: number; pass?: boolean } | null> {
        this.queue = this.queue.then(
            () => this.runSearch(moves, side, timeMs, komi, boardSize),
            () => this.runSearch(moves, side, timeMs, komi, boardSize),
        );
        return this.queue;
    }

    dispose() {
        if (this.pending) {
            clearTimeout(this.pending.timeout);
            this.pending.resolve({ ok: false, text: 'disposed' });
            this.pending = null;
        }
        try {
            this.process?.stdin.write('quit\n');
        } catch {
            // The process may already be gone.
        }
        this.process?.kill();
        this.process = null;
        this.readyPromise = null;
    }

    private resetAfterStartupFailure() {
        if (this.pending) {
            clearTimeout(this.pending.timeout);
            this.pending.resolve({ ok: false, text: 'startup failed' });
            this.pending = null;
        }
        try {
            this.process?.kill();
        } catch {
            // The process may already be gone.
        }
        this.process = null;
        this.readyPromise = null;
    }

    private async runSearch(
        moves: GoMove[],
        side: Stone,
        timeMs: number,
        komi: number,
        boardSize: number,
    ): Promise<{ row: number; col: number; pass?: boolean } | null> {
        try {
            await this.ensureReady();
        } catch (error) {
            this.lastError = error instanceof Error ? error.message : String(error);
            return null;
        }
        if (!this.process) return null;

        const safeBoardSize = boardSize === BOARD_SIZE ? BOARD_SIZE : BOARD_SIZE;
        const setupCommands = [`boardsize ${safeBoardSize}`, `komi ${Number.isFinite(komi) ? komi : 0}`, 'clear_board'];
        for (const command of setupCommands) {
            const response = await this.command(command, 3000);
            if (!response.ok) {
                this.lastError = `${command}: ${response.text}`;
                return null;
            }
        }

        for (const move of moves) {
            const color = stoneToGtpColor(move.player);
            const point = move.pass ? 'pass' : pointToGtp(move.row, move.col, safeBoardSize);
            if (!point) return null;
            const response = await this.command(`play ${color} ${point}`, 3000);
            if (!response.ok) {
                this.lastError = `play ${color} ${point}: ${response.text}`;
                return null;
            }
        }

        const seconds = Math.max(1, Math.ceil(timeMs / 1000));
        await this.command(`time_settings 0 ${seconds} 1`, 3000).catch(() => ({ ok: false, text: '' }));
        await this.command('kata-set-param maxVisits 96', 3000).catch(() => ({ ok: false, text: '' }));

        const response = await this.command(`genmove ${stoneToGtpColor(side)}`, Math.max(12_000, timeMs + 10_000));
        if (!response.ok) {
            this.lastError = `genmove: ${response.text}`;
            return null;
        }

        const move = response.text.trim().split(/\s+/)[0] ?? '';
        if (/^(pass|resign)$/i.test(move)) return { row: -1, col: -1, pass: true };
        return gtpToPoint(move, safeBoardSize);
    }

    private ensureReady(): Promise<void> {
        if (this.readyPromise) return this.readyPromise;

        this.readyPromise = new Promise((resolve, reject) => {
            const engine = spawn(this.launch.executable, this.launch.args, {
                cwd: path.dirname(this.launch.executable),
                stdio: 'pipe',
            });
            this.process = engine;

            engine.stdout.setEncoding('utf8');
            engine.stdout.on('data', chunk => this.handleStdout(chunk));

            engine.stderr.setEncoding('utf8');
            engine.stderr.on('data', chunk => {
                this.stderrTail = `${this.stderrTail}${chunk}`.slice(-4000);
            });
            engine.on('error', reject);
            engine.on('exit', () => {
                this.process = null;
                this.readyPromise = null;
                if (this.pending) {
                    clearTimeout(this.pending.timeout);
                    this.pending.resolve({ ok: false, text: 'engine exited' });
                    this.pending = null;
                }
            });

            this.command('protocol_version', STARTUP_TIMEOUT_MS)
                .then(response => {
                    if (!response.ok)
                        throw new Error(response.text || this.stderrTail || 'KataGo did not enter GTP mode');
                    resolve();
                })
                .catch(error => {
                    this.resetAfterStartupFailure();
                    reject(error);
                });
        });

        return this.readyPromise;
    }

    private command(command: string, timeoutMs: number): Promise<GtpResponse> {
        const engine = this.process;
        if (!engine) return Promise.resolve({ ok: false, text: 'engine is not running' });

        return new Promise(resolve => {
            const timeout = setTimeout(() => {
                if (this.pending?.resolve === resolve) this.pending = null;
                resolve({ ok: false, text: `timeout: ${command}` });
            }, timeoutMs);

            this.pending = { resolve, timeout, lines: [] };
            engine.stdin.write(`${command}\n`);
        });
    }

    private handleStdout(chunk: string) {
        this.stdoutBuffer += chunk;
        const lines = this.stdoutBuffer.split(/\r?\n/);
        this.stdoutBuffer = lines.pop() ?? '';

        for (const line of lines) {
            const pending = this.pending;
            if (!pending) continue;

            if (line.trim() === '' && pending.lines.length > 0) {
                clearTimeout(pending.timeout);
                this.pending = null;
                const first = pending.lines[0].trim();
                const ok = first.startsWith('=');
                const normalized = pending.lines
                    .map((item, index) => (index === 0 ? item.replace(/^[=?]\s*/, '') : item))
                    .join('\n')
                    .trim();
                if (!ok) this.lastError = normalized;
                pending.resolve({ ok, text: normalized });
                continue;
            }

            if (line.startsWith('=') || line.startsWith('?') || pending.lines.length > 0) {
                pending.lines.push(line);
            }
        }
    }
}

function stoneToGtpColor(stone: Stone): 'B' | 'W' {
    return stone === 1 ? 'B' : 'W';
}

function isValidCoord(row: number, col: number, boardSize = BOARD_SIZE): boolean {
    return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < boardSize && col >= 0 && col < boardSize;
}

function pointToGtp(row: unknown, col: unknown, boardSize = BOARD_SIZE): string | null {
    const r = Number(row);
    const c = Number(col);
    if (!isValidCoord(r, c, boardSize)) return null;
    return `${GTP_COLUMNS[c]}${boardSize - r}`;
}

function gtpToPoint(point: string, boardSize = BOARD_SIZE): { row: number; col: number } | null {
    const match = point
        .trim()
        .toUpperCase()
        .match(/^([A-HJ-T])(\d+)$/);
    if (!match) return null;
    const col = GTP_COLUMNS.indexOf(match[1]);
    const line = Number(match[2]);
    const row = boardSize - line;
    if (!isValidCoord(row, col, boardSize)) return null;
    return { row, col };
}

function normalizeMoves(input: unknown): GoMove[] | null {
    if (!Array.isArray(input)) return null;

    const moves: GoMove[] = [];
    for (const item of input) {
        if (!item || typeof item !== 'object') return null;
        const move = item as Partial<GoMove>;
        if (move.player !== 1 && move.player !== 2) return null;

        if (move.pass) {
            moves.push({ player: move.player, pass: true });
            continue;
        }

        if (!isValidCoord(Number(move.row), Number(move.col))) return null;
        moves.push({ row: Number(move.row), col: Number(move.col), player: move.player });
    }

    return moves;
}

function findFirstFile(dir: string, names: string[], patterns: RegExp[]): string | null {
    for (const name of names) {
        const candidate = path.resolve(dir, name);
        if (fs.existsSync(candidate)) return candidate;
    }

    if (!fs.existsSync(dir)) return null;
    for (const entry of fs.readdirSync(dir)) {
        if (patterns.some(pattern => pattern.test(entry))) return path.resolve(dir, entry);
    }
    return null;
}

function findLaunch(root: string): KataGoLaunch | null {
    const kataGoDir = path.resolve(root, 'engines', 'katago');
    const executable =
        [
            process.env.KATAGO_EXECUTABLE,
            path.resolve(kataGoDir, process.platform === 'win32' ? 'katago.exe' : 'katago'),
            path.resolve(kataGoDir, process.platform === 'win32' ? 'katago-opencl.exe' : 'katago-opencl'),
            path.resolve(kataGoDir, process.platform === 'win32' ? 'katago-eigen.exe' : 'katago-eigen'),
        ]
            .filter(Boolean)
            .find(candidate => candidate && fs.existsSync(candidate)) ?? null;

    if (!executable) return null;

    const modelPath =
        process.env.KATAGO_MODEL && fs.existsSync(process.env.KATAGO_MODEL)
            ? process.env.KATAGO_MODEL
            : findFirstFile(
                  kataGoDir,
                  ['model.bin.gz', 'model.txt.gz', 'network.bin.gz', 'network.txt.gz'],
                  [/\.(bin|txt)\.gz$/i],
              );

    const configPath =
        process.env.KATAGO_CONFIG && fs.existsSync(process.env.KATAGO_CONFIG)
            ? process.env.KATAGO_CONFIG
            : findFirstFile(kataGoDir, ['gtp.cfg', 'default_gtp.cfg', 'analysis.cfg'], [/gtp.*\.cfg$/i, /\.cfg$/i]);

    if (!modelPath || !configPath) {
        return { executable, args: [], enginePath: executable, modelPath, configPath };
    }

    return {
        executable,
        args: ['gtp', '-model', modelPath, '-config', configPath],
        enginePath: executable,
        modelPath,
        configPath,
    };
}

function readJsonBody(req: import('node:http').IncomingMessage): Promise<BestMoveRequest> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 256_000) {
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

function attachKataGoApi(
    root: string,
    middlewares: { use: (path: string, handler: import('node:http').RequestListener) => void },
) {
    const launch = findLaunch(root);
    const engine = launch?.modelPath && launch.configPath ? new KataGoGtp(launch) : null;

    middlewares.use('/api/katago/status', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(
            JSON.stringify({
                available: !!engine,
                enginePath: launch?.enginePath ?? null,
                modelPath: launch?.modelPath ?? null,
                configPath: launch?.configPath ?? null,
            }),
        );
    });

    middlewares.use('/api/katago/bestmove', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');

        if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end(JSON.stringify({ ok: false, error: 'POST only' }));
            return;
        }

        if (!engine) {
            res.statusCode = 503;
            res.end(JSON.stringify({ ok: false, error: 'KataGo executable, model, or config not found', launch }));
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

            const side = body.side === 1 || body.side === 2 ? body.side : null;
            if (!side) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: 'Missing or invalid side' }));
                return;
            }

            const bestmove = await engine.search(moves, side, body.timeMs, body.komi, body.boardSize);
            res.end(
                JSON.stringify({
                    ok: !!bestmove,
                    bestmove,
                    error: bestmove ? undefined : engine.getLastError(),
                    enginePath: launch.enginePath,
                }),
            );
        } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
        }
    });

    return () => engine?.dispose();
}

export function katagoPlugin(): Plugin {
    let root = process.cwd();

    return {
        name: 'gamehall-katago',
        configResolved(config) {
            root = config.root;
        },
        configureServer(server) {
            const dispose = attachKataGoApi(root, server.middlewares);
            server.httpServer?.once('close', dispose);
        },
        configurePreviewServer(server) {
            return () => {
                const dispose = attachKataGoApi(root, server.middlewares);
                server.httpServer?.once('close', dispose);
            };
        },
    };
}
