import { ref, onUnmounted } from 'vue';

const BOARD_SIZE = 15;
const CELL_SIZE = 36;
const PADDING = 24;
const CANVAS_W = PADDING * 2 + (BOARD_SIZE - 1) * CELL_SIZE;
const CANVAS_H = CANVAS_W;

type CellState = 0 | 1 | 2;
type GameResult = 'playing' | 'black_win' | 'white_win' | 'draw';
type AIDifficulty = 'easy' | 'hard';

const DIRECTIONS = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
];

function createEmptyBoard(): CellState[][] {
    return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
}

function checkWin(board: CellState[][], row: number, col: number, player: CellState): boolean {
    if (player === 0) return false;
    for (const [dr, dc] of DIRECTIONS) {
        let count = 1;
        for (let i = 1; i < 5; i++) {
            const r = row + dr * i,
                c = col + dc * i;
            if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) break;
            if (board[r][c] !== player) break;
            count++;
        }
        for (let i = 1; i < 5; i++) {
            const r = row - dr * i,
                c = col - dc * i;
            if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) break;
            if (board[r][c] !== player) break;
            count++;
        }
        if (count >= 5) return true;
    }
    return false;
}

const SCORE_FIVE = 100000000;
const SCORE_OPEN_FOUR = 5000000;
const SCORE_RUSH_FOUR = 500000;
const SCORE_OPEN_THREE = 50000;
const SCORE_RUSH_THREE = 5000;
const SCORE_OPEN_TWO = 1000;
const SCORE_RUSH_TWO = 100;
const SCORE_DOUBLE_THREAT = 250000;
const SCORE_DOUBLE_THREE = 180000;
const MOVE_RANDOMNESS = 1200;
const CLOSE_SCORE_RATIO = 0.025;
const AI_TIME_LIMIT_MS = 1100;
const RAPFI_MOVE_TIME_MS = 1200;
const MAX_SEARCH_DEPTH = 4;
const ROOT_RANDOMNESS = 900;
const ROOT_CLOSE_SCORE_RATIO = 0.015;
const PLAYER_FORECAST_DEPTH = 3;
const PLAYER_FORECAST_PLAYER_BRANCHES = [6, 4, 3];
const PLAYER_FORECAST_AI_BRANCHES = [5, 4, 3];
const PLAYER_FORECAST_WEIGHT = 0.28;
const PLAYER_FORECAST_DECAY = 0.72;
const STONE_ANIMATION_MS = 360;

interface SearchContext {
    startTime: number;
    timeLimit: number;
    timedOut: boolean;
    table: Map<string, { depth: number; score: number }>;
    forecast: Map<string, number>;
}

interface MoveThreat {
    score: number;
    five: boolean;
    openFour: number;
    rushFour: number;
    openThree: number;
    rushThree: number;
    openTwo: number;
}

interface TacticalMove {
    move: [number, number];
    attack: MoveThreat;
    defend: MoveThreat;
    attackForcing: number;
    defendForcing: number;
}

interface RapfiBestMoveResponse {
    ok?: boolean;
    bestmove?: {
        row?: number;
        col?: number;
    } | null;
}

interface StoneAnimation {
    row: number;
    col: number;
    player: CellState;
    startedAt: number;
}

function getOpponent(player: CellState): CellState {
    return player === 1 ? 2 : 1;
}

function isInside(row: number, col: number): boolean {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function createThreat(): MoveThreat {
    return {
        score: 0,
        five: false,
        openFour: 0,
        rushFour: 0,
        openThree: 0,
        rushThree: 0,
        openTwo: 0,
    };
}

function mergeThreat(target: MoveThreat, source: MoveThreat) {
    target.score += source.score;
    target.five ||= source.five;
    target.openFour += source.openFour;
    target.rushFour += source.rushFour;
    target.openThree += source.openThree;
    target.rushThree += source.rushThree;
    target.openTwo += source.openTwo;
}

function cellAfterMove(
    board: CellState[][],
    row: number,
    col: number,
    moveRow: number,
    moveCol: number,
    player: CellState,
): CellState | -1 {
    if (!isInside(row, col)) return -1;
    if (row === moveRow && col === moveCol) return player;
    return board[row][col];
}

function evaluateLineAfterMove(
    board: CellState[][],
    row: number,
    col: number,
    dr: number,
    dc: number,
    player: CellState,
): MoveThreat {
    const threat = createThreat();
    let bestFour = 0;
    let bestThree = 0;
    let bestTwo = 0;

    for (let start = -4; start <= 0; start++) {
        let stones = 0;
        let blocked = false;

        for (let i = 0; i < 5; i++) {
            const nr = row + dr * (start + i);
            const nc = col + dc * (start + i);
            const cell = cellAfterMove(board, nr, nc, row, col, player);

            if (cell === player) stones++;
            else if (cell !== 0) {
                blocked = true;
                break;
            }
        }

        if (blocked) continue;

        const before = cellAfterMove(board, row + dr * (start - 1), col + dc * (start - 1), row, col, player);
        const after = cellAfterMove(board, row + dr * (start + 5), col + dc * (start + 5), row, col, player);
        const openEnds = (before === 0 ? 1 : 0) + (after === 0 ? 1 : 0);

        if (stones >= 5) {
            threat.five = true;
            bestFour = Math.max(bestFour, 2);
        } else if (stones === 4) {
            bestFour = Math.max(bestFour, openEnds >= 2 ? 2 : 1);
        } else if (stones === 3) {
            if (openEnds >= 2) bestThree = Math.max(bestThree, 2);
            else if (openEnds === 1) bestThree = Math.max(bestThree, 1);
        } else if (stones === 2) {
            if (openEnds >= 2) bestTwo = Math.max(bestTwo, 2);
            else if (openEnds === 1) bestTwo = Math.max(bestTwo, 1);
        }
    }

    if (threat.five) threat.score += SCORE_FIVE;
    if (bestFour === 2) {
        threat.openFour++;
        threat.score += SCORE_OPEN_FOUR;
    } else if (bestFour === 1) {
        threat.rushFour++;
        threat.score += SCORE_RUSH_FOUR;
    }

    if (bestThree === 2) {
        threat.openThree++;
        threat.score += SCORE_OPEN_THREE;
    } else if (bestThree === 1) {
        threat.rushThree++;
        threat.score += SCORE_RUSH_THREE;
    }

    if (bestTwo === 2) {
        threat.openTwo++;
        threat.score += SCORE_OPEN_TWO;
    } else if (bestTwo === 1) {
        threat.score += SCORE_RUSH_TWO;
    }

    return threat;
}

function evaluateMove(board: CellState[][], row: number, col: number, player: CellState): MoveThreat {
    const threat = createThreat();
    if (board[row][col] !== 0) return threat;

    for (const [dr, dc] of DIRECTIONS) {
        mergeThreat(threat, evaluateLineAfterMove(board, row, col, dr, dc, player));
    }

    const fours = threat.openFour + threat.rushFour;
    const strongThrees = threat.openThree;
    if (isDoubleThree(threat)) {
        threat.score += SCORE_DOUBLE_THREE;
    }
    if (fours >= 2 || (fours >= 1 && strongThrees >= 1)) {
        threat.score += SCORE_DOUBLE_THREAT;
    }

    return threat;
}

function evaluatePosition(board: CellState[][], row: number, col: number, player: CellState): number {
    return evaluateMove(board, row, col, player).score;
}

function easeOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
}

function evaluateBoard(board: CellState[][], player: CellState): number {
    const opp = getOpponent(player);
    let score = 0;

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] === 0) continue;
            const isPlayer = board[r][c] === player;

            for (const [dr, dc] of DIRECTIONS) {
                let count = 1;
                for (let i = 1; i < 5; i++) {
                    const nr = r + dr * i,
                        nc = c + dc * i;
                    if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) break;
                    if (board[nr][nc] !== board[r][c]) break;
                    count++;
                }
                // Only score each line once from its starting stone
                const br = r - dr,
                    bc = c - dc;
                if (br >= 0 && br < BOARD_SIZE && bc >= 0 && bc < BOARD_SIZE && board[br][bc] === board[r][c]) continue;

                let openEnds = 0;
                if (br >= 0 && br < BOARD_SIZE && bc >= 0 && bc < BOARD_SIZE && board[br][bc] === 0) openEnds++;
                const ar = r + dr * count,
                    ac = c + dc * count;
                if (ar >= 0 && ar < BOARD_SIZE && ac >= 0 && ac < BOARD_SIZE && board[ar][ac] === 0) openEnds++;

                let s = 0;
                if (count >= 5) s = SCORE_FIVE;
                else if (count === 4 && openEnds >= 2) s = SCORE_OPEN_FOUR;
                else if (count === 4 && openEnds >= 1) s = SCORE_RUSH_FOUR;
                else if (count === 3 && openEnds >= 2) s = SCORE_OPEN_THREE;
                else if (count === 3 && openEnds >= 1) s = SCORE_RUSH_THREE;
                else if (count === 2 && openEnds >= 2) s = SCORE_OPEN_TWO;

                score += isPlayer ? s : -s;
            }
        }
    }

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] !== 0) continue;
            if (!hasNeighbor(board, r, c, 2)) continue;

            const attack = evaluateMove(board, r, c, player);
            const defend = evaluateMove(board, r, c, opp);
            score += attack.score * 0.08 - defend.score * 0.1;
        }
    }

    return score;
}

function hasNeighbor(board: CellState[][], row: number, col: number, radius = 2): boolean {
    for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = row + dr;
            const nc = col + dc;
            if (isInside(nr, nc) && board[nr][nc] !== 0) return true;
        }
    }
    return false;
}

function isDoubleThree(threat: MoveThreat): boolean {
    return threat.openThree >= 2;
}

function countForcingThreats(threat: MoveThreat): number {
    const fours = threat.openFour + threat.rushFour;
    const threes = threat.openThree;
    let count = fours;
    if (threes >= 2) count += 2;
    if (fours >= 1 && threes >= 1) count += 1;
    return count;
}

function chooseRandomMove(moves: [number, number][]): [number, number] {
    return moves[Math.floor(Math.random() * moves.length)];
}

function tacticalScore(item: TacticalMove): number {
    return item.attack.score * 1.15 + item.defend.score * 1.25;
}

function chooseTacticalMove(
    items: TacticalMove[],
    predicate: (item: TacticalMove) => boolean,
): [number, number] | null {
    const options = items.filter(predicate);
    if (options.length === 0) return null;

    const bestScore = Math.max(...options.map(tacticalScore));
    const tolerance = Math.max(MOVE_RANDOMNESS, Math.abs(bestScore) * CLOSE_SCORE_RATIO);
    const closeOptions = options.filter(item => tacticalScore(item) >= bestScore - tolerance);
    return chooseRandomMove(closeOptions.map(item => item.move));
}

function getCandidates(
    board: CellState[][],
    aiPlayer: CellState,
    opp: CellState,
    maxCount: number,
    randomness = 0,
): [number, number][] {
    const scored: { row: number; col: number; score: number }[] = [];

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] !== 0) continue;

            if (!hasNeighbor(board, r, c, 2)) continue;

            const attack = evaluateMove(board, r, c, aiPlayer);
            const defend = evaluateMove(board, r, c, opp);
            const attackForcing = countForcingThreats(attack);
            const defendForcing = countForcingThreats(defend);
            const centerBias = 20 - Math.abs(7 - r) - Math.abs(7 - c);
            let total = attack.score * 1.15 + defend.score * 1.25 + centerBias;

            if (attack.five) total += SCORE_FIVE;
            if (defend.five) total += SCORE_FIVE * 0.95;
            if (isDoubleThree(attack)) total += SCORE_DOUBLE_THREE * 1.35;
            if (isDoubleThree(defend)) total += SCORE_DOUBLE_THREE * 1.5;
            if (attackForcing >= 2) total += SCORE_DOUBLE_THREAT * 1.4;
            if (defendForcing >= 2) total += SCORE_DOUBLE_THREAT * 1.6;
            if (attack.openFour > 0) total += SCORE_OPEN_FOUR;
            if (defend.openFour > 0) total += SCORE_OPEN_FOUR * 1.1;

            if (randomness > 0) total += Math.random() * randomness;
            scored.push({ row: r, col: c, score: total });
        }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxCount).map(s => [s.row, s.col] as [number, number]);
}

function cloneBoard(board: CellState[][]): CellState[][] {
    return board.map(row => [...row]);
}

function hasWinOnBoard(board: CellState[][], player: CellState): boolean {
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] !== player) continue;
            for (const [dr, dc] of DIRECTIONS) {
                let count = 1;
                for (let i = 1; i < 5; i++) {
                    const nr = r + dr * i,
                        nc = c + dc * i;
                    if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) break;
                    if (board[nr][nc] !== player) break;
                    count++;
                }
                if (count >= 5) return true;
            }
        }
    }
    return false;
}

function boardKey(board: CellState[][], player: CellState): string {
    return `${player}:${board.map(row => row.join('')).join('')}`;
}

function checkTime(context: SearchContext): boolean {
    if (Date.now() - context.startTime >= context.timeLimit) {
        context.timedOut = true;
        return true;
    }
    return false;
}

function forecastBranchLimit(limits: number[], depthIndex: number): number {
    return limits[Math.min(depthIndex, limits.length - 1)] ?? limits[limits.length - 1] ?? 1;
}

function evaluateThreatUrgency(threat: MoveThreat): number {
    let score = threat.score;
    const forcing = countForcingThreats(threat);

    if (threat.five) score += SCORE_FIVE;
    if (threat.openFour > 0) score += SCORE_OPEN_FOUR * 1.25;
    if (threat.rushFour > 0) score += SCORE_RUSH_FOUR * 0.8;
    if (isDoubleThree(threat)) score += SCORE_DOUBLE_THREE * 1.3;
    if (forcing >= 2) score += SCORE_DOUBLE_THREAT * 1.2;

    return score;
}

function evaluateForecastBoardRisk(board: CellState[][], aiPlayer: CellState): number {
    const player = getOpponent(aiPlayer);
    if (hasWinOnBoard(board, player)) return SCORE_FIVE;
    if (hasWinOnBoard(board, aiPlayer)) return -SCORE_FIVE * 0.92;

    const playerCandidates = getCandidates(board, player, aiPlayer, 6);
    const aiCandidates = getCandidates(board, aiPlayer, player, 6);

    let playerPressure = 0;
    for (const [r, c] of playerCandidates) {
        playerPressure = Math.max(playerPressure, evaluateThreatUrgency(evaluateMove(board, r, c, player)));
    }

    let aiCounterPressure = 0;
    for (const [r, c] of aiCandidates) {
        aiCounterPressure = Math.max(aiCounterPressure, evaluateThreatUrgency(evaluateMove(board, r, c, aiPlayer)));
    }

    const structure = evaluateBoard(board, player);
    return playerPressure * 0.78 - aiCounterPressure * 0.42 + structure * 0.18;
}

function forecastPlayerSequence(
    board: CellState[][],
    aiPlayer: CellState,
    playerDepth: number,
    context: SearchContext,
): number {
    if (checkTime(context)) return evaluateForecastBoardRisk(board, aiPlayer);

    const player = getOpponent(aiPlayer);
    if (playerDepth >= PLAYER_FORECAST_DEPTH) return evaluateForecastBoardRisk(board, aiPlayer);

    const cacheKey = `forecast:player:${playerDepth}:${boardKey(board, player)}`;
    const cached = context.forecast.get(cacheKey);
    if (cached !== undefined) return cached;

    const candidates = getCandidates(
        board,
        player,
        aiPlayer,
        forecastBranchLimit(PLAYER_FORECAST_PLAYER_BRANCHES, playerDepth),
    );
    if (candidates.length === 0) {
        const risk = evaluateForecastBoardRisk(board, aiPlayer);
        context.forecast.set(cacheKey, risk);
        return risk;
    }

    let bestRisk = -Infinity;
    for (const [r, c] of candidates) {
        if (checkTime(context)) break;

        const threat = evaluateMove(board, r, c, player);
        board[r][c] = player;
        const risk = checkWin(board, r, c, player)
            ? SCORE_FIVE - playerDepth * 4000
            : evaluateThreatUrgency(threat) * (1 - playerDepth * 0.12) +
              PLAYER_FORECAST_DECAY * forecastAIResponse(board, aiPlayer, playerDepth, context);
        board[r][c] = 0;

        bestRisk = Math.max(bestRisk, risk);
    }

    if (bestRisk === -Infinity) bestRisk = evaluateForecastBoardRisk(board, aiPlayer);
    if (!context.timedOut) context.forecast.set(cacheKey, bestRisk);
    return bestRisk;
}

function forecastAIResponse(
    board: CellState[][],
    aiPlayer: CellState,
    playerDepth: number,
    context: SearchContext,
): number {
    if (checkTime(context)) return evaluateForecastBoardRisk(board, aiPlayer);

    const player = getOpponent(aiPlayer);
    const cacheKey = `forecast:ai:${playerDepth}:${boardKey(board, aiPlayer)}`;
    const cached = context.forecast.get(cacheKey);
    if (cached !== undefined) return cached;

    const candidates = getCandidates(
        board,
        aiPlayer,
        player,
        forecastBranchLimit(PLAYER_FORECAST_AI_BRANCHES, playerDepth),
    );
    if (candidates.length === 0) {
        const risk = evaluateForecastBoardRisk(board, aiPlayer);
        context.forecast.set(cacheKey, risk);
        return risk;
    }

    let bestRisk = Infinity;
    for (const [r, c] of candidates) {
        if (checkTime(context)) break;

        board[r][c] = aiPlayer;
        const risk = checkWin(board, r, c, aiPlayer)
            ? -SCORE_FIVE * 0.9 + playerDepth * 2500
            : playerDepth + 1 >= PLAYER_FORECAST_DEPTH
              ? evaluateForecastBoardRisk(board, aiPlayer)
              : forecastPlayerSequence(board, aiPlayer, playerDepth + 1, context);
        board[r][c] = 0;

        bestRisk = Math.min(bestRisk, risk);
    }

    if (bestRisk === Infinity) bestRisk = evaluateForecastBoardRisk(board, aiPlayer);
    if (!context.timedOut) context.forecast.set(cacheKey, bestRisk);
    return bestRisk;
}

function evaluatePlayerForecast(board: CellState[][], aiPlayer: CellState, context: SearchContext): number {
    const cacheKey = `forecast:root:${boardKey(board, getOpponent(aiPlayer))}`;
    const cached = context.forecast.get(cacheKey);
    if (cached !== undefined) return cached;

    const risk = forecastPlayerSequence(board, aiPlayer, 0, context);
    if (!context.timedOut) context.forecast.set(cacheKey, risk);
    return risk;
}

function chooseWeightedRootMove(
    scoredMoves: { move: [number, number]; score: number; searchScore: number; forecastPenalty: number }[],
): { move: [number, number]; score: number; searchScore: number; forecastPenalty: number } {
    const bestScore = Math.max(...scoredMoves.map(item => item.score));
    const tolerance = Math.max(ROOT_RANDOMNESS, Math.abs(bestScore) * ROOT_CLOSE_SCORE_RATIO);
    const closeMoves = scoredMoves.filter(item => item.score >= bestScore - tolerance);

    if (closeMoves.length === 1) return closeMoves[0];

    const floor = bestScore - tolerance;
    const weighted = closeMoves.map(item => ({
        item,
        weight: Math.max(1, item.score - floor + ROOT_RANDOMNESS * 0.08),
    }));
    const totalWeight = weighted.reduce((sum, current) => sum + current.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const current of weighted) {
        roll -= current.weight;
        if (roll <= 0) return current.item;
    }

    return weighted[weighted.length - 1].item;
}

function negamax(
    board: CellState[][],
    depth: number,
    alpha: number,
    beta: number,
    player: CellState,
    context: SearchContext,
    ply = 0,
): number {
    if (checkTime(context)) return evaluateBoard(board, player);

    const opp = getOpponent(player);
    if (hasWinOnBoard(board, opp)) return -SCORE_FIVE + ply * 1000;
    if (depth === 0) return evaluateBoard(board, player);

    const key = boardKey(board, player);
    const cached = context.table.get(key);
    if (cached && cached.depth >= depth) return cached.score;

    const candidates = getCandidates(board, player, opp, depth >= 3 ? 10 : depth >= 2 ? 12 : 16);
    if (candidates.length === 0) return 0;

    let value = -Infinity;
    let searchedAll = true;
    for (const [r, c] of candidates) {
        if (checkTime(context)) {
            searchedAll = false;
            break;
        }

        board[r][c] = player;
        const score = checkWin(board, r, c, player)
            ? SCORE_FIVE - ply * 1000
            : -negamax(board, depth - 1, -beta, -alpha, opp, context, ply + 1);
        board[r][c] = 0;

        value = Math.max(value, score);
        alpha = Math.max(alpha, score);
        if (alpha >= beta) {
            searchedAll = false;
            break;
        }
    }

    if (searchedAll) context.table.set(key, { depth, score: value });
    return value;
}

function aiFindBestMove(board: CellState[][], aiPlayer: CellState): [number, number] | null {
    const opp = getOpponent(aiPlayer);

    const emptyCount = board.flat().filter(c => c === 0).length;
    if (emptyCount === BOARD_SIZE * BOARD_SIZE) {
        const openingMoves: [number, number][] = [
            [7, 7],
            [7, 6],
            [6, 7],
            [7, 8],
            [8, 7],
        ];
        return Math.random() < 0.65 ? [7, 7] : chooseRandomMove(openingMoves.slice(1));
    }

    const candidates = getCandidates(board, aiPlayer, opp, 20);
    if (candidates.length === 0) return null;

    const winningMoves: [number, number][] = [];
    for (const [r, c] of candidates) {
        const test = cloneBoard(board);
        test[r][c] = aiPlayer;
        if (hasWinOnBoard(test, aiPlayer)) winningMoves.push([r, c]);
    }
    if (winningMoves.length > 0) return chooseRandomMove(winningMoves);

    const blockingMoves: [number, number][] = [];
    for (const [r, c] of candidates) {
        const test = cloneBoard(board);
        test[r][c] = opp;
        if (hasWinOnBoard(test, opp)) blockingMoves.push([r, c]);
    }
    if (blockingMoves.length > 0) return chooseRandomMove(blockingMoves);

    const tactical: TacticalMove[] = candidates.map(([r, c]) => {
        const attack = evaluateMove(board, r, c, aiPlayer);
        const defend = evaluateMove(board, r, c, opp);
        return {
            move: [r, c] as [number, number],
            attack,
            defend,
            attackForcing: countForcingThreats(attack),
            defendForcing: countForcingThreats(defend),
        };
    });

    const ownThreat = chooseTacticalMove(
        tactical,
        item => item.attack.openFour > 0 || isDoubleThree(item.attack) || item.attackForcing >= 2,
    );
    if (ownThreat) return ownThreat;

    const opponentThreat = chooseTacticalMove(
        tactical,
        item => item.defend.openFour > 0 || isDoubleThree(item.defend) || item.defendForcing >= 2,
    );
    if (opponentThreat) return opponentThreat;

    const context: SearchContext = {
        startTime: Date.now(),
        timeLimit: AI_TIME_LIMIT_MS,
        timedOut: false,
        table: new Map(),
        forecast: new Map(),
    };
    let bestMove: [number, number] = candidates[0];
    let bestScore = -Infinity;

    for (let depth = 1; depth <= MAX_SEARCH_DEPTH; depth++) {
        const depthMoves: { move: [number, number]; score: number; searchScore: number; forecastPenalty: number }[] =
            [];

        for (const [r, c] of candidates) {
            if (checkTime(context)) break;

            board[r][c] = aiPlayer;
            const searchScore = checkWin(board, r, c, aiPlayer)
                ? SCORE_FIVE
                : -negamax(board, depth - 1, -Infinity, Infinity, opp, context, 1);
            const forecastPenalty =
                searchScore >= SCORE_FIVE
                    ? 0
                    : evaluatePlayerForecast(board, aiPlayer, context) * PLAYER_FORECAST_WEIGHT;
            board[r][c] = 0;

            depthMoves.push({
                move: [r, c],
                searchScore,
                forecastPenalty,
                score: searchScore - forecastPenalty,
            });
        }

        if (context.timedOut) break;
        if (depthMoves.length > 0) {
            const selected = chooseWeightedRootMove(depthMoves);
            bestScore = selected.score;
            bestMove = selected.move;
        }
    }

    void bestScore;
    return bestMove;
}

async function findRapfiMove(board: CellState[][], aiPlayer: CellState): Promise<[number, number] | null> {
    const moves = board.flatMap((row, rowIndex) =>
        row.flatMap((cell, colIndex) => {
            if (cell === 0) return [];
            return [
                {
                    row: rowIndex,
                    col: colIndex,
                    player: cell === aiPlayer ? 1 : 2,
                },
            ];
        }),
    );

    try {
        const response = await fetch('/api/rapfi/bestmove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ moves, timeMs: RAPFI_MOVE_TIME_MS }),
        });

        if (!response.ok) return null;
        const data = (await response.json()) as RapfiBestMoveResponse;
        const row = data.bestmove?.row;
        const col = data.bestmove?.col;

        if (!data.ok || row === undefined || col === undefined) return null;
        if (!isInside(row, col) || board[row][col] !== 0) return null;
        return [row, col];
    } catch {
        return null;
    }
}

export function useGomoku() {
    const board = ref<CellState[][]>(createEmptyBoard());
    const currentPlayer = ref<CellState>(1);
    const gameStatus = ref<'idle' | 'playing' | 'ended'>('idle');
    const result = ref<GameResult>('playing');
    const message = ref('');
    const playerColor = ref<CellState>(1);
    const difficulty = ref<AIDifficulty>('hard');
    const lastMove = ref<[number, number] | null>(null);
    const winLine = ref<[number, number][] | null>(null);
    const moveCount = ref(0);
    const hoverPos = ref<[number, number] | null>(null);
    const placeAnimation = ref<StoneAnimation | null>(null);

    let aiTimer: ReturnType<typeof setTimeout> | null = null;

    function startGame() {
        const selectedColor = playerColor.value;
        board.value = createEmptyBoard();
        currentPlayer.value = 1;
        gameStatus.value = 'playing';
        result.value = 'playing';
        playerColor.value = selectedColor;
        lastMove.value = null;
        winLine.value = null;
        moveCount.value = 0;
        hoverPos.value = null;
        placeAnimation.value = null;
        clearAITimer();
        if (playerColor.value === 2) {
            message.value = '电脑先手思考中...';
            scheduleAIMove();
        } else {
            message.value = '黑棋先行，请落子';
        }
    }

    function clearAITimer() {
        if (aiTimer !== null) {
            clearTimeout(aiTimer);
            aiTimer = null;
        }
    }

    function boardToCanvas(idx: number): number {
        return PADDING + idx * CELL_SIZE;
    }

    function canvasToBoard(pos: number): number {
        return Math.round((pos - PADDING) / CELL_SIZE);
    }

    function handleClick(mx: number, my: number) {
        if (gameStatus.value !== 'playing') return;
        if (currentPlayer.value !== playerColor.value) return;

        const row = canvasToBoard(my);
        const col = canvasToBoard(mx);
        if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return;

        if (board.value[row][col] !== 0) return;

        placeStone(row, col, playerColor.value);
    }

    function handleHover(mx: number, my: number) {
        if (gameStatus.value !== 'playing') return;
        if (currentPlayer.value !== playerColor.value) return;

        const row = canvasToBoard(my);
        const col = canvasToBoard(mx);
        if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
            hoverPos.value = null;
            return;
        }
        if (board.value[row][col] !== 0) {
            hoverPos.value = null;
            return;
        }
        hoverPos.value = [row, col];
    }

    function placeStone(row: number, col: number, player: CellState) {
        board.value[row][col] = player;
        lastMove.value = [row, col];
        placeAnimation.value = { row, col, player, startedAt: performance.now() };
        moveCount.value++;

        if (checkWin(board.value, row, col, player)) {
            result.value = player === 1 ? 'black_win' : 'white_win';
            gameStatus.value = 'ended';
            winLine.value = findWinLine(board.value, row, col, player);
            message.value = player === playerColor.value ? '🎉 你赢了！' : '💔 电脑赢了';
            return;
        }

        if (moveCount.value >= BOARD_SIZE * BOARD_SIZE) {
            result.value = 'draw';
            gameStatus.value = 'ended';
            message.value = '平局！';
            return;
        }

        currentPlayer.value = currentPlayer.value === 1 ? 2 : 1;

        if (currentPlayer.value !== playerColor.value) {
            message.value = '电脑思考中...';
            scheduleAIMove();
        } else {
            message.value = '轮到你落子';
        }
    }

    function findWinLine(board: CellState[][], row: number, col: number, player: CellState): [number, number][] {
        for (const [dr, dc] of DIRECTIONS) {
            const line: [number, number][] = [];
            for (let i = -4; i <= 4; i++) {
                const r = row + dr * i,
                    c = col + dc * i;
                if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) continue;
                if (board[r][c] !== player) continue;
                line.push([r, c]);
            }
            if (line.length >= 5) {
                const sorted = line.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
                for (let i = 0; i <= sorted.length - 5; i++) {
                    const seq = sorted.slice(i, i + 5);
                    const valid = seq.every(([r, c], idx) => {
                        if (idx === 0) return true;
                        return r === seq[idx - 1][0] + dr && c === seq[idx - 1][1] + dc;
                    });
                    if (valid) return seq;
                }
            }
        }
        return [];
    }

    function scheduleAIMove() {
        clearAITimer();
        aiTimer = setTimeout(
            async () => {
                if (gameStatus.value !== 'playing') return;
                const aiColor = playerColor.value === 1 ? 2 : 1;
                if (difficulty.value === 'easy') {
                    const move = aiFindBestMove(board.value, aiColor);
                    if (move) {
                        placeStone(move[0], move[1], aiColor);
                    }
                    return;
                }

                const positionSnapshot = boardKey(board.value, aiColor);
                const engineMove = await findRapfiMove(board.value, aiColor);

                if (gameStatus.value !== 'playing' || currentPlayer.value !== aiColor) return;
                if (boardKey(board.value, aiColor) !== positionSnapshot) {
                    message.value = '局面已变化，Rapfi 重新思考中...';
                    scheduleAIMove();
                    return;
                }

                if (!engineMove) {
                    message.value = 'Rapfi 没有返回有效落子，请确认引擎已启动';
                    gameStatus.value = 'ended';
                    return;
                }

                placeStone(engineMove[0], engineMove[1], aiColor);
            },
            400 + Math.random() * 300,
        );
    }

    function switchColor() {
        if (gameStatus.value !== 'idle') return;
        playerColor.value = playerColor.value === 1 ? 2 : 1;
        message.value = playerColor.value === 1 ? '你执黑棋（先行）' : '你执白棋（后手）';
    }

    function draw(ctx: CanvasRenderingContext2D) {
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        const now = performance.now();

        function drawStone(
            x: number,
            y: number,
            player: CellState,
            options: { scale?: number; alpha?: number; squash?: number; glow?: number; marker?: boolean } = {},
        ) {
            const scale = options.scale ?? 1;
            const alpha = options.alpha ?? 1;
            const squash = options.squash ?? 0;
            const radius = CELL_SIZE * 0.42;
            const radiusX = radius * scale * (1 + squash * 0.08);
            const radiusY = radius * scale * (1 - squash * 0.12);

            ctx.save();
            ctx.globalAlpha = alpha;

            ctx.beginPath();
            ctx.ellipse(x, y + radius * 0.28, radiusX * 0.82, radiusY * 0.34, 0, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(37, 22, 10, ${0.18 * alpha})`;
            ctx.fill();

            ctx.beginPath();
            ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
            if (player === 1) {
                const grad = ctx.createRadialGradient(x - 3, y - 3, 2, x, y, radius);
                grad.addColorStop(0, '#666');
                grad.addColorStop(0.48, '#262626');
                grad.addColorStop(1, '#050505');
                ctx.fillStyle = grad;
            } else {
                const grad = ctx.createRadialGradient(x - 4, y - 5, 2, x, y, radius);
                grad.addColorStop(0, '#fff');
                grad.addColorStop(0.52, '#ececec');
                grad.addColorStop(1, '#bdbdbd');
                ctx.fillStyle = grad;
            }
            ctx.shadowColor = player === 1 ? 'rgba(0,0,0,0.32)' : 'rgba(255,255,255,0.22)';
            ctx.shadowBlur = 6 * scale;
            ctx.shadowOffsetY = 2;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;
            ctx.strokeStyle = player === 1 ? '#000' : '#999';
            ctx.lineWidth = 1;
            ctx.stroke();

            if (options.marker) {
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fillStyle = '#ef4444';
                ctx.fill();
            }

            if (options.glow && options.glow > 0) {
                ctx.beginPath();
                ctx.arc(x, y, radius * (1.05 + options.glow * 0.9), 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(251, 191, 36, ${0.42 * (1 - options.glow)})`;
                ctx.lineWidth = 3;
                ctx.stroke();
            }

            ctx.restore();
        }

        ctx.fillStyle = '#dcb35c';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        ctx.strokeStyle = '#6b4226';
        ctx.lineWidth = 1;

        for (let i = 0; i < BOARD_SIZE; i++) {
            const x = PADDING + i * CELL_SIZE;
            ctx.beginPath();
            ctx.moveTo(x, PADDING);
            ctx.lineTo(x, PADDING + (BOARD_SIZE - 1) * CELL_SIZE);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(PADDING, x);
            ctx.lineTo(PADDING + (BOARD_SIZE - 1) * CELL_SIZE, x);
            ctx.stroke();
        }

        const starPoints = [
            [3, 3],
            [3, 7],
            [3, 11],
            [7, 3],
            [7, 7],
            [7, 11],
            [11, 3],
            [11, 7],
            [11, 11],
        ];
        for (const [r, c] of starPoints) {
            const x = PADDING + c * CELL_SIZE,
                y = PADDING + r * CELL_SIZE;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#6b4226';
            ctx.fill();
        }

        if (winLine.value) {
            ctx.strokeStyle = 'rgba(255,215,0,0.6)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            const [fr, fc] = winLine.value[0];
            const [tr, tc] = winLine.value[4];
            ctx.moveTo(PADDING + fc * CELL_SIZE, PADDING + fr * CELL_SIZE);
            ctx.lineTo(PADDING + tc * CELL_SIZE, PADDING + tr * CELL_SIZE);
            ctx.stroke();
        }

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (board.value[r][c] === 0) continue;
                const x = PADDING + c * CELL_SIZE,
                    y = PADDING + r * CELL_SIZE;
                const isLast = lastMove.value && lastMove.value[0] === r && lastMove.value[1] === c;

                const animation = placeAnimation.value;
                if (animation && animation.row === r && animation.col === c && animation.player === board.value[r][c]) {
                    const progress = Math.min(1, (now - animation.startedAt) / STONE_ANIMATION_MS);
                    const drop = easeOutBack(Math.min(1, progress * 1.08));
                    const settle = Math.max(0, 1 - Math.abs(progress - 0.72) / 0.28);
                    const glow = progress < 1 ? easeOutCubic(progress) : 0;
                    const animatedY = y - (1 - drop) * CELL_SIZE * 1.35;
                    drawStone(x, animatedY, board.value[r][c], {
                        scale: 0.72 + Math.min(1, progress * 1.25) * 0.28,
                        alpha: Math.min(1, 0.35 + progress * 0.65),
                        squash: settle * 0.7,
                        glow,
                        marker: progress >= 0.82,
                    });
                    if (progress >= 1) placeAnimation.value = null;
                } else {
                    drawStone(x, y, board.value[r][c], { marker: !!isLast });
                }
            }
        }

        if (hoverPos.value) {
            const [hr, hc] = hoverPos.value;
            const x = PADDING + hc * CELL_SIZE,
                y = PADDING + hr * CELL_SIZE;
            ctx.beginPath();
            ctx.arc(x, y, CELL_SIZE * 0.42, 0, Math.PI * 2);
            ctx.fillStyle = playerColor.value === 1 ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.28)';
            ctx.fill();
            ctx.strokeStyle = playerColor.value === 1 ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        ctx.fillStyle = '#6b4226';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let i = 0; i < BOARD_SIZE; i++) {
            ctx.fillText(String.fromCharCode(65 + i), PADDING + i * CELL_SIZE, 2);
            ctx.fillText(`${BOARD_SIZE - i}`, 2, PADDING + i * CELL_SIZE - 5);
        }
    }

    function getWidth() {
        return CANVAS_W;
    }
    function getHeight() {
        return CANVAS_H;
    }

    onUnmounted(() => {
        clearAITimer();
    });

    return {
        board,
        currentPlayer,
        gameStatus,
        result,
        message,
        playerColor,
        difficulty,
        lastMove,
        winLine,
        moveCount,
        startGame,
        handleClick,
        handleHover,
        draw,
        getWidth,
        getHeight,
        switchColor,
        clearAITimer,
    };
}
