import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

type Stone = 1 | 2;

interface Connect6Move {
    row: number;
    col: number;
    player: Stone;
}

interface BestMovesRequest {
    moves?: Connect6Move[];
    side?: Stone;
    timeMs?: number;
    stonesToMove?: number;
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

interface Connect6KataGoLaunch {
    executable: string;
    args: string[];
    enginePath: string;
    modelPath: string | null;
    configPath: string | null;
}

const BOARD_SIZE = 19;
const DEFAULT_MOVE_TIME = 1600;
const STARTUP_TIMEOUT_MS = 180_000;
const GTP_COLUMNS = 'ABCDEFGHJKLMNOPQRST';

class Connect6KataGoGtp {
    private process: ChildProcessWithoutNullStreams | null = null;
    private readyPromise: Promise<void> | null = null;
    private pending: PendingCommand | null = null;
    private stdoutBuffer = '';
    private stderrTail = '';
    private lastError = '';
    private queue: Promise<{ row: number; col: number }[] | null> = Promise.resolve(null);

    constructor(private launch: Connect6KataGoLaunch) {}

    getLastError(): string {
        return this.lastError || this.stderrTail;
    }

    search(
        moves: Connect6Move[],
        side: Stone,
        stonesToMove: number,
        timeMs = DEFAULT_MOVE_TIME,
        boardSize = BOARD_SIZE,
    ): Promise<{ row: number; col: number }[] | null> {
        this.queue = this.queue.then(
            () => this.runSearch(moves, side, stonesToMove, timeMs, boardSize),
            () => this.runSearch(moves, side, stonesToMove, timeMs, boardSize),
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
            // Process may already be gone.
        }
        this.process?.kill();
        this.process = null;
        this.readyPromise = null;
    }

    private async runSearch(
        moves: Connect6Move[],
        side: Stone,
        stonesToMove: number,
        timeMs: number,
        boardSize: number,
    ): Promise<{ row: number; col: number }[] | null> {
        try {
            await this.ensureReady();
        } catch (error) {
            this.lastError = error instanceof Error ? error.message : String(error);
            return null;
        }
        if (!this.process) return null;

        const safeBoardSize = boardSize === BOARD_SIZE ? BOARD_SIZE : BOARD_SIZE;
        for (const command of [`boardsize ${safeBoardSize}`, 'komi 0', 'clear_board']) {
            const response = await this.command(command, 3000);
            if (!response.ok) {
                this.lastError = `${command}: ${response.text}`;
                return null;
            }
        }

        for (const move of moves) {
            const point = pointToGtp(move.row, move.col, safeBoardSize);
            if (!point) return null;
            const response = await this.command(`play ${stoneToGtpColor(move.player)} ${point}`, 3000);
            if (!response.ok) {
                this.lastError = `play ${stoneToGtpColor(move.player)} ${point}: ${response.text}`;
                return null;
            }
        }

        const seconds = Math.max(1, Math.ceil(timeMs / 1000));
        await this.command(`time_settings 0 ${seconds} 1`, 3000).catch(() => ({ ok: false, text: '' }));
        await this.command('kata-set-param maxVisits 128', 3000).catch(() => ({ ok: false, text: '' }));

        const selected: { row: number; col: number }[] = [];
        const targetCount = Math.max(1, stonesToMove);
        for (let i = 0; i < targetCount; i++) {
            const response = await this.command(`genmove ${stoneToGtpColor(side)}`, Math.max(18_000, timeMs + 12_000));
            if (!response.ok) {
                this.lastError = `genmove: ${response.text}`;
                return selected.length > 0 ? selected : null;
            }

            const parsed = parseGtpPoints(response.text, safeBoardSize).filter(
                point => !selected.some(move => move.row === point.row && move.col === point.col),
            );
            if (parsed.length === 0) {
                this.lastError = `genmove returned no usable coordinates: ${response.text}`;
                return selected.length > 0 ? selected : null;
            }
            selected.push(parsed[0]);
        }
        return selected;
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
                        throw new Error(response.text || this.stderrTail || 'KataGomo did not enter GTP mode');
                    resolve();
                })
                .catch(error => {
                    this.resetAfterStartupFailure();
                    reject(error);
                });
        });

        return this.readyPromise;
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
            // Process may already be gone.
        }
        this.process = null;
        this.readyPromise = null;
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

function parseGtpPoints(text: string, boardSize = BOARD_SIZE): { row: number; col: number }[] {
    const points: { row: number; col: number }[] = [];
    for (const token of text.split(/[\s,;]+/)) {
        if (/^(pass|resign)$/i.test(token)) continue;
        const point = gtpToPoint(token, boardSize);
        if (point) points.push(point);
    }
    return points;
}

function normalizeMoves(input: unknown): Connect6Move[] | null {
    if (!Array.isArray(input)) return null;

    const moves: Connect6Move[] = [];
    for (const item of input) {
        if (!item || typeof item !== 'object') return null;
        const move = item as Partial<Connect6Move>;
        if (!isValidCoord(Number(move.row), Number(move.col))) return null;
        if (move.player !== 1 && move.player !== 2) return null;
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
    const stack = [dir];
    while (stack.length > 0) {
        const current = stack.shift();
        if (!current) continue;
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const fullPath = path.resolve(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(fullPath);
                continue;
            }
            if (patterns.some(pattern => pattern.test(entry.name))) return fullPath;
        }
    }
    return null;
}

function findLaunch(root: string): Connect6KataGoLaunch | null {
    const engineDir = path.resolve(root, 'engines', 'connect6-katago');
    const executable =
        [
            process.env.CONNECT6_KATAGO_EXECUTABLE,
            path.resolve(engineDir, process.platform === 'win32' ? 'katago.exe' : 'katago'),
            path.resolve(engineDir, process.platform === 'win32' ? 'katagomo.exe' : 'katagomo'),
            path.resolve(engineDir, process.platform === 'win32' ? 'katago-opencl.exe' : 'katago-opencl'),
            findFirstFile(engineDir, [], [/^connectsix19x.*\.exe$/i, /^katago.*\.exe$/i, /^katagomo.*\.exe$/i]),
        ]
            .filter(Boolean)
            .find(candidate => candidate && fs.existsSync(candidate)) ?? null;

    if (!executable) return null;

    const modelPath =
        process.env.CONNECT6_KATAGO_MODEL && fs.existsSync(process.env.CONNECT6_KATAGO_MODEL)
            ? process.env.CONNECT6_KATAGO_MODEL
            : findFirstFile(
                  engineDir,
                  ['connectsix19x_b18_20250801.bin.gz', 'model.bin.gz', 'network.bin.gz'],
                  [/connectsix19x.*\.bin\.gz$/i, /\.(bin|txt)\.gz$/i],
              );

    const configPath =
        process.env.CONNECT6_KATAGO_CONFIG && fs.existsSync(process.env.CONNECT6_KATAGO_CONFIG)
            ? process.env.CONNECT6_KATAGO_CONFIG
            : findFirstFile(
                  engineDir,
                  ['engine.cfg', 'gtp.cfg', 'default_gtp.cfg', 'analysis.cfg'],
                  [/^engine\.cfg$/i, /gtp.*\.cfg$/i, /\.cfg$/i],
              );

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

function readJsonBody(req: import('node:http').IncomingMessage): Promise<BestMovesRequest> {
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

function attachConnect6KataGoApi(
    root: string,
    middlewares: { use: (path: string, handler: import('node:http').RequestListener) => void },
) {
    const launch = findLaunch(root);
    const engine = launch?.modelPath && launch.configPath ? new Connect6KataGoGtp(launch) : null;

    middlewares.use('/api/connect6-katago/status', (_req, res) => {
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

    middlewares.use('/api/connect6-katago/bestmoves', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');

        if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end(JSON.stringify({ ok: false, error: 'POST only' }));
            return;
        }

        if (!engine) {
            res.statusCode = 503;
            res.end(
                JSON.stringify({
                    ok: false,
                    error: 'Connect6 KataGomo executable, model, or config not found',
                    launch,
                }),
            );
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

            const stonesToMove =
                Number.isInteger(body.stonesToMove) && body.stonesToMove && body.stonesToMove > 0
                    ? Math.min(2, body.stonesToMove)
                    : 1;
            const bestmoves = await engine.search(moves, side, stonesToMove, body.timeMs, body.boardSize);
            res.end(
                JSON.stringify({
                    ok: !!bestmoves,
                    bestmoves,
                    error: bestmoves ? undefined : engine.getLastError(),
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

export function connect6KataGoPlugin(): Plugin {
    let root = process.cwd();

    return {
        name: 'gamehall-connect6-katago',
        configResolved(config) {
            root = config.root;
        },
        configureServer(server) {
            const dispose = attachConnect6KataGoApi(root, server.middlewares);
            server.httpServer?.once('close', dispose);
        },
        configurePreviewServer(server) {
            return () => {
                const dispose = attachConnect6KataGoApi(root, server.middlewares);
                server.httpServer?.once('close', dispose);
            };
        },
    };
}
