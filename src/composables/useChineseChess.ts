import { ref, onUnmounted } from 'vue';

const COLS = 9;
const ROWS = 10;
const CELL_SIZE = 56;
const BOARD_PADDING = 32;
const CANVAS_W = BOARD_PADDING * 2 + (COLS - 1) * CELL_SIZE;
const CANVAS_H = BOARD_PADDING * 2 + (ROWS - 1) * CELL_SIZE;

type Side = 'red' | 'black';
type PieceType = 'king' | 'advisor' | 'elephant' | 'horse' | 'rook' | 'cannon' | 'pawn';
type ChessDifficulty = 'easy' | 'hard';

interface Piece {
    type: PieceType;
    side: Side;
    row: number;
    col: number;
    alive: boolean;
}

interface Move {
    piece: Piece;
    fromRow: number;
    fromCol: number;
    toRow: number;
    toCol: number;
    captured: Piece | null;
}

interface MovingAnimation {
    piece: Piece;
    fromRow: number;
    fromCol: number;
    toRow: number;
    toCol: number;
    startTime: number;
    duration: number;
}

interface CaptureAnimation {
    piece: Piece;
    row: number;
    col: number;
    startTime: number;
    duration: number;
}

const PIECE_NAMES: Record<Side, Record<PieceType, string>> = {
    red: { king: '帅', advisor: '仕', elephant: '相', horse: '馬', rook: '車', cannon: '炮', pawn: '兵' },
    black: { king: '将', advisor: '士', elephant: '象', horse: '马', rook: '车', cannon: '砲', pawn: '卒' },
};

const PIECE_VALUES: Record<PieceType, number> = {
    king: 10000,
    rook: 600,
    cannon: 300,
    horse: 300,
    elephant: 120,
    advisor: 120,
    pawn: 30,
};

const CHECKMATE_SCORE = 1_000_000;
//象棋 AI 每次思考允许使用的最大时间，单位是毫秒。
const AI_TIME_LIMIT_MS = 2400;
const MAX_SEARCH_DEPTH = 6;
const QUIESCENCE_DEPTH = 5;
const PLAYER_FORECAST_DEPTH = 5;
const PLAYER_FORECAST_MOVE_LIMIT = 5;
const AI_FORECAST_REPLY_LIMIT = 3;
const FIVE_MOVE_FORECAST_WEIGHT = 0.74;
const FORECAST_DEPTH_DECAY = 0.82;
const ROOT_SURVIVAL_WEIGHT = 1.18;
const ROOT_ATTACK_WEIGHT = 0.24;
const ROOT_FORCING_WEIGHT = 0.58;
const ROOT_INITIATIVE_WEIGHT = 0.72;
const ROOT_EXCHANGE_RISK_WEIGHT = 0.92;
const ROOT_TRADE_LOSS_WEIGHT = 1.65;
const ROOT_MAJOR_CAPTURE_SACRIFICE_WEIGHT = 2.25;
const ROOT_FREE_CAPTURE_WEIGHT = 1.9;
const MAJOR_CAPTURE_FORCING_THRESHOLD = 760;
const CENTER_CANNON_DEFENSE_BONUS = 760;
const ROOT_SCORE_JITTER = 18;
const ROOT_RANDOM_MARGIN = 28;
const ATTACK_PIECES = new Set<PieceType>(['rook', 'cannon', 'horse']);
const SETUP_ANIMATION_DURATION = 360;
const SETUP_ANIMATION_STAGGER = 18;
const MOVE_ANIMATION_DURATION = 260;
const CAPTURE_ANIMATION_DURATION = 360;
const PIKAFISH_MOVE_TIME_MS = 1400;
const PIKAFISH_FILES = 'abcdefghi';
const FEN_PIECES: Record<Side, Record<PieceType, string>> = {
    red: { king: 'K', advisor: 'A', elephant: 'B', horse: 'N', rook: 'R', cannon: 'C', pawn: 'P' },
    black: { king: 'k', advisor: 'a', elephant: 'b', horse: 'n', rook: 'r', cannon: 'c', pawn: 'p' },
};
const SURVIVAL_VALUES: Record<PieceType, number> = {
    king: CHECKMATE_SCORE,
    rook: 2200,
    cannon: 1150,
    horse: 1150,
    elephant: 220,
    advisor: 220,
    pawn: 55,
};

interface SearchEntry {
    depth: number;
    score: number;
    flag: 'exact' | 'lower' | 'upper';
}

interface SearchContext {
    startTime: number;
    timeLimit: number;
    timedOut: boolean;
    nodes: number;
    table: Map<string, SearchEntry>;
    killerMoves: Map<number, string[]>;
    history: Map<string, number>;
    forecastRisk: Map<string, number>;
}

function oppositeSide(side: Side): Side {
    return side === 'red' ? 'black' : 'red';
}

function moveKey(move: Move): string {
    return `${move.piece.type}:${move.fromRow},${move.fromCol}-${move.toRow},${move.toCol}`;
}

function boardKey(pieces: Piece[], sideToMove: Side): string {
    const tokens = pieces
        .filter(p => p.alive)
        .map(p => `${p.side[0]}${p.type[0]}${p.row}${p.col}`)
        .sort();
    return `${sideToMove}|${tokens.join('.')}`;
}

function createInitialPieces(): Piece[] {
    const pieces: Piece[] = [];
    const backRank: PieceType[] = [
        'rook',
        'horse',
        'elephant',
        'advisor',
        'king',
        'advisor',
        'elephant',
        'horse',
        'rook',
    ];
    for (let c = 0; c < 9; c++) {
        pieces.push({ type: backRank[c], side: 'red', row: 9, col: c, alive: true });
        pieces.push({ type: backRank[c], side: 'black', row: 0, col: c, alive: true });
    }
    pieces.push({ type: 'cannon', side: 'red', row: 7, col: 1, alive: true });
    pieces.push({ type: 'cannon', side: 'red', row: 7, col: 7, alive: true });
    pieces.push({ type: 'cannon', side: 'black', row: 2, col: 1, alive: true });
    pieces.push({ type: 'cannon', side: 'black', row: 2, col: 7, alive: true });
    for (let c = 0; c < 9; c += 2) {
        pieces.push({ type: 'pawn', side: 'red', row: 6, col: c, alive: true });
        pieces.push({ type: 'pawn', side: 'black', row: 3, col: c, alive: true });
    }
    return pieces;
}

function clonePieces(pieces: Piece[]): Piece[] {
    return pieces.map(p => ({ ...p }));
}

function getPieceAt(pieces: Piece[], row: number, col: number): Piece | null {
    return pieces.find(p => p.alive && p.row === row && p.col === col) || null;
}

function hasPieceBetweenRows(pieces: Piece[], col: number, rowA: number, rowB: number): boolean {
    const minRow = Math.min(rowA, rowB);
    const maxRow = Math.max(rowA, rowB);
    for (let r = minRow + 1; r < maxRow; r++) {
        if (getPieceAt(pieces, r, col)) return true;
    }
    return false;
}

function areKingsFacing(pieces: Piece[]): boolean {
    const redKing = pieces.find(p => p.alive && p.type === 'king' && p.side === 'red');
    const blackKing = pieces.find(p => p.alive && p.type === 'king' && p.side === 'black');
    if (!redKing || !blackKing || redKing.col !== blackKing.col) return false;
    return !hasPieceBetweenRows(pieces, redKing.col, redKing.row, blackKing.row);
}

function isInBoard(row: number, col: number): boolean {
    return row >= 0 && row < 10 && col >= 0 && col < 9;
}

function isInPalace(row: number, col: number, side: Side): boolean {
    const rows = side === 'red' ? [7, 8, 9] : [0, 1, 2];
    return rows.includes(row) && col >= 3 && col <= 5;
}

function isOnOwnSide(row: number, side: Side): boolean {
    return side === 'red' ? row >= 5 : row <= 4;
}

function forwardProgress(row: number, side: Side): number {
    return side === 'red' ? 9 - row : row;
}

function centralFileScore(col: number): number {
    return 4 - Math.abs(col - 4);
}

function isHomeRank(row: number, side: Side): boolean {
    return side === 'red' ? row === 9 : row === 0;
}

function isCannonHomeRank(row: number, side: Side): boolean {
    return side === 'red' ? row === 7 : row === 2;
}

function countPiecesBetweenRows(pieces: Piece[], col: number, rowA: number, rowB: number): number {
    let count = 0;
    const minRow = Math.min(rowA, rowB);
    const maxRow = Math.max(rowA, rowB);
    for (let r = minRow + 1; r < maxRow; r++) {
        if (getPieceAt(pieces, r, col)) count++;
    }
    return count;
}

function isOwnPawnAt(pieces: Piece[], row: number, col: number, side: Side): boolean {
    const piece = getPieceAt(pieces, row, col);
    return !!piece && piece.alive && piece.side === side && piece.type === 'pawn';
}

function cannonPawnSandwichPenalty(piece: Piece, pieces: Piece[]): number {
    if (!piece.alive || piece.type !== 'cannon') return 0;

    let penalty = 0;
    const side = piece.side;
    const leftPawn = isOwnPawnAt(pieces, piece.row, piece.col - 1, side);
    const rightPawn = isOwnPawnAt(pieces, piece.row, piece.col + 1, side);
    const frontPawn = isOwnPawnAt(pieces, piece.row + (side === 'red' ? -1 : 1), piece.col, side);
    const backPawn = isOwnPawnAt(pieces, piece.row + (side === 'red' ? 1 : -1), piece.col, side);

    if (leftPawn && rightPawn) penalty += 420;
    if (frontPawn && backPawn) penalty += 360;
    if ((leftPawn || rightPawn) && (frontPawn || backPawn)) penalty += 180;

    const mobility = getValidMovesForPiece(piece, pieces).length;
    if (mobility <= 2 && (leftPawn || rightPawn || frontPawn || backPawn)) penalty += 160;

    return penalty;
}

function enemyPalacePressureScore(piece: Piece, pieces: Piece[]): number {
    if (!ATTACK_PIECES.has(piece.type)) return 0;

    const enemyKing = pieces.find(p => p.alive && p.type === 'king' && p.side !== piece.side);
    if (!enemyKing) return 0;

    let score = 0;
    if (attacksSquare(piece, enemyKing.row, enemyKing.col, pieces)) {
        score += piece.type === 'horse' ? 80 : 105;
    }

    if (piece.col === enemyKing.col) {
        const blockers = countPiecesBetweenRows(pieces, piece.col, piece.row, enemyKing.row);
        if (piece.type === 'rook') {
            if (blockers === 0) score += 90;
            else if (blockers === 1) score += 42;
        } else if (piece.type === 'cannon') {
            if (blockers === 1) score += 110;
            else if (blockers === 2) score += 45;
        }
    }

    const enemyRows = piece.side === 'red' ? [0, 1, 2] : [7, 8, 9];
    let palaceTargets = 0;
    for (const row of enemyRows) {
        for (let col = 3; col <= 5; col++) {
            if (attacksSquare(piece, row, col, pieces)) palaceTargets++;
        }
    }
    score += Math.min(4, palaceTargets) * (piece.type === 'horse' ? 12 : 16);

    const progress = forwardProgress(piece.row, piece.side);
    if (progress >= 5) score += (progress - 4) * (piece.type === 'horse' ? 9 : 7);
    score += centralFileScore(piece.col) * (piece.type === 'cannon' ? 5 : 4);

    return score;
}

function moveAggressionScore(pieces: Piece[], move: Move, side: Side): number {
    if (move.piece.type === 'pawn') {
        const progress = forwardProgress(move.toRow, move.piece.side) - forwardProgress(move.fromRow, move.piece.side);
        let score = progress > 0 ? 24 : 0;
        if (!isOnOwnSide(move.toRow, move.piece.side)) score += 8;
        if (move.toCol >= 3 && move.toCol <= 5) score += 8;
        return score;
    }

    if (!ATTACK_PIECES.has(move.piece.type)) {
        return move.toCol >= 3 && move.toCol <= 5 ? 10 : 0;
    }

    const fromProgress = forwardProgress(move.fromRow, move.piece.side);
    const toProgress = forwardProgress(move.toRow, move.piece.side);
    const progressGain = toProgress - fromProgress;
    const centerGain = centralFileScore(move.toCol) - centralFileScore(move.fromCol);
    let score = move.piece.type === 'rook' ? 76 : move.piece.type === 'cannon' ? 66 : 62;

    if (progressGain > 0) score += progressGain * (move.piece.type === 'horse' ? 28 : 22);
    if (centerGain > 0) score += centerGain * (move.piece.type === 'cannon' ? 18 : 14);
    if (move.piece.type === 'rook' && isHomeRank(move.fromRow, move.piece.side)) score += 46;
    if (move.piece.type === 'horse' && isHomeRank(move.fromRow, move.piece.side)) score += 38;
    if (move.piece.type === 'cannon' && isCannonHomeRank(move.fromRow, move.piece.side)) score += 32;

    const after = makeMove(pieces, move);
    const moved = getPieceAt(after, move.toRow, move.toCol);
    if (moved && moved.side === side && moved.type === move.piece.type) {
        score += enemyPalacePressureScore(moved, after) * 0.55;
        score -= cannonPawnSandwichPenalty(moved, after) * 0.7;
    }

    return score;
}

function rootMoveStyleScore(move: Move): number {
    if (ATTACK_PIECES.has(move.piece.type)) return move.piece.type === 'rook' ? 34 : 28;
    if (move.piece.type === 'pawn') return -22;
    return 0;
}

function getValidMovesForPiece(piece: Piece, pieces: Piece[]): [number, number][] {
    const moves: [number, number][] = [];
    const { type, side, row, col } = piece;

    function canMoveTo(r: number, c: number): boolean {
        if (!isInBoard(r, c)) return false;
        const target = getPieceAt(pieces, r, c);
        return !target || target.side !== side;
    }

    switch (type) {
        case 'rook': {
            const dirs = [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
            ];
            for (const [dr, dc] of dirs) {
                let r = row + dr,
                    c = col + dc;
                while (isInBoard(r, c)) {
                    const target = getPieceAt(pieces, r, c);
                    if (target) {
                        if (target.side !== side) moves.push([r, c]);
                        break;
                    }
                    moves.push([r, c]);
                    r += dr;
                    c += dc;
                }
            }
            break;
        }
        case 'horse': {
            const jumps: [number, number, number, number][] = [
                [-2, -1, -1, 0],
                [-2, 1, -1, 0],
                [2, -1, 1, 0],
                [2, 1, 1, 0],
                [-1, -2, 0, -1],
                [-1, 2, 0, 1],
                [1, -2, 0, -1],
                [1, 2, 0, 1],
            ];
            for (const [dr, dc, lr, lc] of jumps) {
                const nr = row + dr,
                    nc = col + dc;
                const legR = row + lr,
                    legC = col + lc;
                if (isInBoard(nr, nc) && canMoveTo(nr, nc) && !getPieceAt(pieces, legR, legC)) {
                    moves.push([nr, nc]);
                }
            }
            break;
        }
        case 'elephant': {
            const jumps: [number, number, number, number][] = [
                [-2, -2, -1, -1],
                [-2, 2, -1, 1],
                [2, -2, 1, -1],
                [2, 2, 1, 1],
            ];
            for (const [dr, dc, lr, lc] of jumps) {
                const nr = row + dr,
                    nc = col + dc;
                const legR = row + lr,
                    legC = col + lc;
                if (
                    isInBoard(nr, nc) &&
                    canMoveTo(nr, nc) &&
                    isOnOwnSide(nr, side) &&
                    !getPieceAt(pieces, legR, legC)
                ) {
                    moves.push([nr, nc]);
                }
            }
            break;
        }
        case 'advisor': {
            const dirs: [number, number][] = [
                [-1, -1],
                [-1, 1],
                [1, -1],
                [1, 1],
            ];
            for (const [dr, dc] of dirs) {
                const nr = row + dr,
                    nc = col + dc;
                if (isInPalace(nr, nc, side) && canMoveTo(nr, nc)) {
                    moves.push([nr, nc]);
                }
            }
            break;
        }
        case 'king': {
            const dirs: [number, number][] = [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
            ];
            for (const [dr, dc] of dirs) {
                const nr = row + dr,
                    nc = col + dc;
                if (isInPalace(nr, nc, side) && canMoveTo(nr, nc)) {
                    moves.push([nr, nc]);
                }
            }
            const opposingKing = pieces.find(p => p.alive && p.type === 'king' && p.side !== side);
            if (opposingKing && col === opposingKing.col) {
                if (!hasPieceBetweenRows(pieces, col, row, opposingKing.row)) {
                    moves.push([opposingKing.row, opposingKing.col]);
                }
            }
            break;
        }
        case 'cannon': {
            const dirs = [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
            ];
            for (const [dr, dc] of dirs) {
                let r = row + dr,
                    c = col + dc;
                let jumped = false;
                while (isInBoard(r, c)) {
                    const target = getPieceAt(pieces, r, c);
                    if (!jumped) {
                        if (target) {
                            jumped = true;
                        } else {
                            moves.push([r, c]);
                        }
                    } else {
                        if (target) {
                            if (target.side !== side) moves.push([r, c]);
                            break;
                        }
                    }
                    r += dr;
                    c += dc;
                }
            }
            break;
        }
        case 'pawn': {
            const forward = side === 'red' ? -1 : 1;
            const crossed = !isOnOwnSide(row, side);
            if (canMoveTo(row + forward, col)) moves.push([row + forward, col]);
            if (crossed) {
                if (canMoveTo(row, col - 1)) moves.push([row, col - 1]);
                if (canMoveTo(row, col + 1)) moves.push([row, col + 1]);
            }
            break;
        }
    }

    return moves;
}

function getLegalMovesForPiece(piece: Piece, pieces: Piece[]): [number, number][] {
    const targets = getValidMovesForPiece(piece, pieces);
    return targets.filter(([tr, tc]) => {
        const captured = getPieceAt(pieces, tr, tc);
        const move: Move = { piece, fromRow: piece.row, fromCol: piece.col, toRow: tr, toCol: tc, captured };
        const after = makeMove(pieces, move);
        return !isInCheck(after, piece.side);
    });
}

function getAllMoves(pieces: Piece[], side: Side): Move[] {
    const allMoves: Move[] = [];
    for (const piece of pieces) {
        if (!piece.alive || piece.side !== side) continue;
        const targets = getValidMovesForPiece(piece, pieces);
        for (const [tr, tc] of targets) {
            const captured = getPieceAt(pieces, tr, tc);
            allMoves.push({ piece, fromRow: piece.row, fromCol: piece.col, toRow: tr, toCol: tc, captured });
        }
    }
    return allMoves;
}

function isInCheck(pieces: Piece[], side: Side): boolean {
    const king = pieces.find(p => p.alive && p.type === 'king' && p.side === side);
    if (!king) return true;
    const oppSide = side === 'red' ? 'black' : 'red';
    const oppKing = pieces.find(p => p.alive && p.type === 'king' && p.side !== side);
    if (oppKing && king.col === oppKing.col && !hasPieceBetweenRows(pieces, king.col, king.row, oppKing.row)) {
        return true;
    }
    const oppMoves = getAllMoves(pieces, oppSide);
    if (oppMoves.some(m => m.toRow === king.row && m.toCol === king.col)) return true;
    return false;
}

function getAllLegalMoves(pieces: Piece[], side: Side): Move[] {
    const allMoves = getAllMoves(pieces, side);
    return allMoves.filter(move => {
        const after = makeMove(pieces, move);
        return !areKingsFacing(after) && !isInCheck(after, side);
    });
}

function isCheckmate(pieces: Piece[], side: Side): boolean {
    const legalMoves = getAllLegalMoves(pieces, side);
    return legalMoves.length === 0 && isInCheck(pieces, side);
}

function isStalemate(pieces: Piece[], side: Side): boolean {
    const legalMoves = getAllLegalMoves(pieces, side);
    return legalMoves.length === 0 && !isInCheck(pieces, side);
}

function makeMove(pieces: Piece[], move: Move): Piece[] {
    const idx = pieces.indexOf(move.piece);
    if (idx < 0) return pieces;
    const newPieces = clonePieces(pieces);
    const p = newPieces[idx];
    p.row = move.toRow;
    p.col = move.toCol;
    if (move.captured) {
        const cap = newPieces.find(
            pp =>
                pp.row === move.captured!.row &&
                pp.col === move.captured!.col &&
                pp.side === move.captured!.side &&
                pp.type === move.captured!.type &&
                pp.alive,
        );
        if (cap) cap.alive = false;
    }
    return newPieces;
}

function piecesToFen(pieces: Piece[], sideToMove: Side): string {
    const rows: string[] = [];

    for (let row = 0; row < ROWS; row++) {
        let fenRow = '';
        let empty = 0;
        for (let col = 0; col < COLS; col++) {
            const piece = getPieceAt(pieces, row, col);
            if (!piece) {
                empty++;
                continue;
            }

            if (empty > 0) {
                fenRow += `${empty}`;
                empty = 0;
            }
            fenRow += FEN_PIECES[piece.side][piece.type];
        }

        if (empty > 0) fenRow += `${empty}`;
        rows.push(fenRow);
    }

    return `${rows.join('/')} ${sideToMove === 'red' ? 'w' : 'b'} - - 0 1`;
}

function uciSquareToBoard(square: string): [number, number] | null {
    if (!/^[a-i][0-9]$/.test(square)) return null;
    const col = PIKAFISH_FILES.indexOf(square[0]);
    const rank = Number(square[1]);
    if (col < 0 || rank < 0 || rank > 9) return null;
    return [9 - rank, col];
}

function findMoveByUci(pieces: Piece[], side: Side, uciMove: string): Move | null {
    const from = uciSquareToBoard(uciMove.slice(0, 2));
    const to = uciSquareToBoard(uciMove.slice(2, 4));
    if (!from || !to) return null;

    const piece = getPieceAt(pieces, from[0], from[1]);
    if (!piece || piece.side !== side) return null;

    return (
        getAllLegalMoves(pieces, side).find(
            move =>
                move.piece === piece &&
                move.fromRow === from[0] &&
                move.fromCol === from[1] &&
                move.toRow === to[0] &&
                move.toCol === to[1],
        ) ?? null
    );
}

async function findPikafishMove(pieces: Piece[], aiSide: Side): Promise<Move | null> {
    if (typeof fetch !== 'function') return null;

    try {
        const response = await fetch('/api/pikafish/bestmove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fen: piecesToFen(pieces, aiSide),
                side: aiSide,
                movetime: PIKAFISH_MOVE_TIME_MS,
            }),
        });
        if (!response.ok) return null;

        const data = (await response.json()) as { ok?: boolean; bestmove?: string | null };
        if (!data.ok || !data.bestmove) return null;
        return findMoveByUci(pieces, aiSide, data.bestmove);
    } catch {
        return null;
    }
}

function attacksSquare(piece: Piece, targetRow: number, targetCol: number, pieces: Piece[]): boolean {
    if (!piece.alive || (piece.row === targetRow && piece.col === targetCol)) return false;
    const dr = targetRow - piece.row;
    const dc = targetCol - piece.col;
    const absR = Math.abs(dr);
    const absC = Math.abs(dc);

    switch (piece.type) {
        case 'rook': {
            if (dr !== 0 && dc !== 0) return false;
            const stepR = Math.sign(dr);
            const stepC = Math.sign(dc);
            let r = piece.row + stepR;
            let c = piece.col + stepC;
            while (r !== targetRow || c !== targetCol) {
                if (getPieceAt(pieces, r, c)) return false;
                r += stepR;
                c += stepC;
            }
            return true;
        }
        case 'cannon': {
            if (dr !== 0 && dc !== 0) return false;
            const stepR = Math.sign(dr);
            const stepC = Math.sign(dc);
            let screens = 0;
            let r = piece.row + stepR;
            let c = piece.col + stepC;
            while (r !== targetRow || c !== targetCol) {
                if (getPieceAt(pieces, r, c)) screens++;
                r += stepR;
                c += stepC;
            }
            return screens === 1;
        }
        case 'horse': {
            if (!((absR === 2 && absC === 1) || (absR === 1 && absC === 2))) return false;
            const legR = piece.row + (absR === 2 ? Math.sign(dr) : 0);
            const legC = piece.col + (absC === 2 ? Math.sign(dc) : 0);
            return !getPieceAt(pieces, legR, legC);
        }
        case 'elephant': {
            if (absR !== 2 || absC !== 2 || !isOnOwnSide(targetRow, piece.side)) return false;
            return !getPieceAt(pieces, piece.row + Math.sign(dr), piece.col + Math.sign(dc));
        }
        case 'advisor':
            return absR === 1 && absC === 1 && isInPalace(targetRow, targetCol, piece.side);
        case 'king': {
            if (absR + absC === 1 && isInPalace(targetRow, targetCol, piece.side)) return true;
            if (piece.col !== targetCol) return false;
            const target = getPieceAt(pieces, targetRow, targetCol);
            if (!target || target.type !== 'king' || target.side === piece.side) return false;
            return !hasPieceBetweenRows(pieces, piece.col, piece.row, targetRow);
        }
        case 'pawn': {
            const forward = piece.side === 'red' ? -1 : 1;
            if (dr === forward && dc === 0) return true;
            return !isOnOwnSide(piece.row, piece.side) && dr === 0 && absC === 1;
        }
    }
}

function countAttackers(pieces: Piece[], row: number, col: number, bySide: Side): number {
    let count = 0;
    for (const piece of pieces) {
        if (piece.alive && piece.side === bySide && attacksSquare(piece, row, col, pieces)) count++;
    }
    return count;
}

function legalRecapturesOn(pieces: Piece[], row: number, col: number, bySide: Side): Move[] {
    return getAllLegalMoves(pieces, bySide).filter(move => move.toRow === row && move.toCol === col && !!move.captured);
}

function cheapestCaptureValue(moves: Move[]): number {
    if (moves.length === 0) return Infinity;
    return Math.min(...moves.map(move => SURVIVAL_VALUES[move.piece.type]));
}

function pieceSurvivalRisk(pieces: Piece[], piece: Piece): number {
    if (!piece.alive) return SURVIVAL_VALUES[piece.type];
    if (piece.type === 'king') return isInCheck(pieces, piece.side) ? CHECKMATE_SCORE * 0.9 : 0;

    const attackers = countAttackers(pieces, piece.row, piece.col, oppositeSide(piece.side));
    if (attackers === 0) return 0;

    const defenders = countAttackers(pieces, piece.row, piece.col, piece.side);
    const value = SURVIVAL_VALUES[piece.type];
    if (defenders === 0) return value * 0.58;
    if (attackers > defenders) return value * (0.34 + Math.min(3, attackers - defenders) * 0.12);
    return value * 0.16;
}

function sideSurvivalRisk(pieces: Piece[], side: Side): number {
    let risk = 0;
    for (const piece of pieces) {
        if (piece.side !== side) continue;
        risk += pieceSurvivalRisk(pieces, piece);
    }
    return risk;
}

function oneMoveTradeLoss(pieces: Piece[], move: Move, side: Side): number {
    if (!move.captured || !ATTACK_PIECES.has(move.piece.type)) return 0;

    const after = makeMove(pieces, move);
    const moved = getPieceAt(after, move.toRow, move.toCol);
    if (!moved || moved.side !== side) return CHECKMATE_SCORE;

    const recaptures = legalRecapturesOn(after, moved.row, moved.col, oppositeSide(side));
    if (recaptures.length === 0) return 0;

    const movedValue = SURVIVAL_VALUES[moved.type];
    const capturedValue = SURVIVAL_VALUES[move.captured.type];
    const cheapestRecapture = cheapestCaptureValue(recaptures);
    const defenders = countAttackers(after, moved.row, moved.col, side);
    const attackers = recaptures.length;
    const rawLoss = movedValue - capturedValue;
    const exchangePressure = Math.max(0, attackers - defenders) * movedValue * 0.18;
    const cheapRecapturePenalty = cheapestRecapture < movedValue ? (movedValue - cheapestRecapture) * 0.12 : 0;

    return Math.max(0, rawLoss) + exchangePressure + cheapRecapturePenalty;
}

function majorCaptureSacrificeRisk(pieces: Piece[], move: Move, side: Side): number {
    if (!move.captured || !ATTACK_PIECES.has(move.piece.type) || !ATTACK_PIECES.has(move.captured.type)) return 0;
    if (hasImmediateMate(pieces, move, side)) return 0;

    const after = makeMove(pieces, move);
    const moved = getPieceAt(after, move.toRow, move.toCol);
    if (!moved || moved.side !== side) return CHECKMATE_SCORE;

    const recaptures = legalRecapturesOn(after, moved.row, moved.col, oppositeSide(side));
    if (recaptures.length === 0) return 0;

    const movedValue = SURVIVAL_VALUES[moved.type];
    const capturedValue = SURVIVAL_VALUES[move.captured.type];
    const forcingScore = forcingAttackScore(pieces, move, side);
    const isNecessaryForcingMove = isMoveCheck(pieces, move, side) || forcingScore >= MAJOR_CAPTURE_FORCING_THRESHOLD;
    if (isNecessaryForcingMove && capturedValue >= movedValue) return movedValue * 0.16;

    const defenders = countAttackers(after, moved.row, moved.col, side);
    const recapturePressure = Math.max(1, recaptures.length - defenders + 1);
    const equalTradePenalty = capturedValue >= movedValue ? movedValue * 0.42 : movedValue * 0.74;
    const netSacrifice = Math.max(0, movedValue - capturedValue) * 0.9;
    return equalTradePenalty + netSacrifice + recapturePressure * movedValue * 0.18;
}

function freeCaptureRisk(pieces: Piece[], side: Side): number {
    const opponent = oppositeSide(side);
    let risk = 0;

    for (const piece of pieces) {
        if (!piece.alive || piece.side !== side || piece.type === 'king') continue;

        const recaptures = legalRecapturesOn(pieces, piece.row, piece.col, opponent);
        if (recaptures.length === 0) continue;

        const value = SURVIVAL_VALUES[piece.type];
        const defenders = countAttackers(pieces, piece.row, piece.col, side);
        const cheapestAttacker = cheapestCaptureValue(recaptures);
        const canBeTakenCheaply = cheapestAttacker < value * 0.72;
        const isLoose = defenders === 0;
        const attackers = recaptures.length;

        if (isLoose) risk += value * 0.82;
        else if (canBeTakenCheaply) risk += value * 0.52;
        else if (attackers > defenders) risk += value * 0.34;
        else risk += value * 0.12;
    }

    return risk;
}

function moveFreeCaptureRisk(pieces: Piece[], move: Move, side: Side): number {
    const before = freeCaptureRisk(pieces, side);
    const after = makeMove(pieces, move);
    const afterRisk = freeCaptureRisk(after, side);
    return Math.max(0, afterRisk - before);
}

function getCenterPawn(pieces: Piece[], side: Side): Piece | null {
    const row = side === 'red' ? 6 : 3;
    return getPieceAt(pieces, row, 4);
}

function hasEnemyCenterCannon(pieces: Piece[], side: Side): boolean {
    return pieces.some(piece => {
        if (!piece.alive || piece.side === side || piece.type !== 'cannon' || piece.col !== 4) return false;
        return side === 'black' ? piece.row >= 5 : piece.row <= 4;
    });
}

function isCenterPawnUnderCannonPressure(pieces: Piece[], side: Side): boolean {
    const pawn = getCenterPawn(pieces, side);
    if (!pawn || pawn.side !== side || pawn.type !== 'pawn') return false;
    return pieces.some(
        piece =>
            piece.alive &&
            piece.side !== side &&
            piece.type === 'cannon' &&
            piece.col === 4 &&
            attacksSquare(piece, pawn.row, pawn.col, pieces),
    );
}

function centerPawnDefenderCount(pieces: Piece[], side: Side): number {
    const pawn = getCenterPawn(pieces, side);
    if (!pawn || pawn.side !== side || pawn.type !== 'pawn') return 0;
    return countAttackers(pieces, pawn.row, pawn.col, side);
}

function isHorseDevelopingToProtectCenterPawn(pieces: Piece[], move: Move, side: Side): boolean {
    if (move.piece.side !== side || move.piece.type !== 'horse') return false;
    if (!isHomeRank(move.fromRow, side)) return false;
    if (side === 'black' && move.toRow !== 2) return false;
    if (side === 'red' && move.toRow !== 7) return false;
    if (move.toCol !== 2 && move.toCol !== 6) return false;

    const after = makeMove(pieces, move);
    const pawn = getCenterPawn(after, side);
    const moved = getPieceAt(after, move.toRow, move.toCol);
    return !!pawn && !!moved && attacksSquare(moved, pawn.row, pawn.col, after);
}

function centerCannonDefenseScore(pieces: Piece[], move: Move, side: Side): number {
    if (!hasEnemyCenterCannon(pieces, side)) return 0;

    const underPressure = isCenterPawnUnderCannonPressure(pieces, side);
    const beforeDefenders = centerPawnDefenderCount(pieces, side);
    const after = makeMove(pieces, move);
    const afterDefenders = centerPawnDefenderCount(after, side);
    const improvedDefense = afterDefenders > beforeDefenders;

    if (isHorseDevelopingToProtectCenterPawn(pieces, move, side)) {
        return CENTER_CANNON_DEFENSE_BONUS + (underPressure ? 260 : 120) + (beforeDefenders === 0 ? 220 : 80);
    }

    if (improvedDefense) return underPressure ? 320 : 180;
    const pawn = getCenterPawn(after, side);
    if (!pawn || pawn.side !== side || pawn.type !== 'pawn') return underPressure ? -520 : -260;
    return 0;
}

function immediateMoveSurvivalSwing(pieces: Piece[], move: Move, side: Side): number {
    const beforeMine = sideSurvivalRisk(pieces, side);
    const beforeEnemy = sideSurvivalRisk(pieces, oppositeSide(side));
    const after = makeMove(pieces, move);
    const afterMine = sideSurvivalRisk(after, side);
    const afterEnemy = sideSurvivalRisk(after, oppositeSide(side));
    return beforeMine - afterMine + (afterEnemy - beforeEnemy) * 0.62;
}

function moveExchangeRisk(pieces: Piece[], move: Move, side: Side): number {
    const after = makeMove(pieces, move);
    const moved = getPieceAt(after, move.toRow, move.toCol);
    if (!moved || moved.side !== side) return CHECKMATE_SCORE;

    const movedValue = SURVIVAL_VALUES[moved.type];
    const capturedValue = move.captured ? SURVIVAL_VALUES[move.captured.type] : 0;
    const attackers = countAttackers(after, moved.row, moved.col, oppositeSide(side));
    if (attackers === 0) return 0;

    const defenders = countAttackers(after, moved.row, moved.col, side);
    const isProtected = defenders > 0;
    const loosePieceRisk = isProtected ? movedValue * 0.32 : movedValue * 0.72;
    const netLoss = Math.max(0, movedValue - capturedValue);
    const overloadRisk = Math.max(0, attackers - defenders) * movedValue * 0.16;
    return loosePieceRisk + netLoss * 0.55 + overloadRisk + oneMoveTradeLoss(pieces, move, side) * 0.75;
}

function forcingAttackScore(pieces: Piece[], move: Move, side: Side): number {
    const after = makeMove(pieces, move);
    const moved = getPieceAt(after, move.toRow, move.toCol);
    if (!moved || moved.side !== side) return 0;

    const enemy = oppositeSide(side);
    let score = 0;
    if (isMoveCheck(pieces, move, side)) score += 420;
    if (ATTACK_PIECES.has(moved.type)) {
        const defenders = countAttackers(after, moved.row, moved.col, side);
        if (defenders > 0) score += 120;
        if (moveExchangeRisk(pieces, move, side) < SURVIVAL_VALUES[moved.type] * 0.35) score += 100;
    }

    for (const target of after) {
        if (!target.alive || target.side !== enemy || target.type === 'king') continue;
        const attackers = countAttackers(after, target.row, target.col, side);
        if (attackers === 0) continue;
        const defenders = countAttackers(after, target.row, target.col, enemy);
        const value = SURVIVAL_VALUES[target.type];
        if (defenders === 0) score += value * 0.34;
        else if (attackers > defenders) score += value * 0.22;
        else score += value * 0.08;
    }

    return score;
}

function rootAttackScore(pieces: Piece[], move: Move, side: Side): number {
    const after = makeMove(pieces, move);
    const enemy = oppositeSide(side);
    let score = moveAggressionScore(pieces, move, side) * 0.85;

    if (move.captured) {
        const exchangeRisk = moveExchangeRisk(pieces, move, side);
        const safeCaptureFactor = exchangeRisk < SURVIVAL_VALUES[move.piece.type] * 0.28 ? 0.2 : 0.07;
        score += SURVIVAL_VALUES[move.captured.type] * safeCaptureFactor;
        if (move.captured.type === 'rook') score += exchangeRisk < 500 ? 180 : 45;
        if (move.captured.type === 'cannon' || move.captured.type === 'horse') score += exchangeRisk < 360 ? 92 : 24;
    }
    if (isMoveCheck(pieces, move, side)) score += 240;

    for (const target of after) {
        if (!target.alive || target.side !== enemy || target.type === 'king') continue;
        const attackers = countAttackers(after, target.row, target.col, side);
        if (attackers === 0) continue;
        const defenders = countAttackers(after, target.row, target.col, enemy);
        const pressure = defenders === 0 ? 0.2 : attackers > defenders ? 0.12 : 0.06;
        score += SURVIVAL_VALUES[target.type] * pressure;
    }

    return score;
}

function initiativeScore(pieces: Piece[], move: Move, side: Side): number {
    const after = makeMove(pieces, move);
    const moved = getPieceAt(after, move.toRow, move.toCol);
    if (!moved || moved.side !== side) return 0;

    let score = 0;
    if (isMoveCheck(pieces, move, side)) score += 620;
    score += forcingAttackScore(pieces, move, side) * 0.85;
    score += rootAttackScore(pieces, move, side) * 0.55;

    if (ATTACK_PIECES.has(moved.type)) {
        score += 170;
        score += enemyPalacePressureScore(moved, after) * 0.85;
        score -= cannonPawnSandwichPenalty(moved, after) * 0.95;
        if (moveExchangeRisk(pieces, move, side) < SURVIVAL_VALUES[moved.type] * 0.36) score += 90;
    } else if (moved.type === 'pawn') {
        const progressGain = forwardProgress(move.toRow, side) - forwardProgress(move.fromRow, side);
        score += progressGain > 0 ? 34 : -18;
    } else {
        score -= 95;
    }

    if (move.captured) {
        score += SURVIVAL_VALUES[move.captured.type] * (ATTACK_PIECES.has(move.captured.type) ? 0.2 : 0.08);
    }

    const enemy = oppositeSide(side);
    for (const target of after) {
        if (!target.alive || target.side !== enemy || !ATTACK_PIECES.has(target.type)) continue;
        const attackers = countAttackers(after, target.row, target.col, side);
        const defenders = countAttackers(after, target.row, target.col, enemy);
        if (attackers > defenders) score += SURVIVAL_VALUES[target.type] * 0.24;
    }

    return score;
}

function isMoveCheck(pieces: Piece[], move: Move, side: Side): boolean {
    return isInCheck(makeMove(pieces, move), oppositeSide(side));
}

function hasImmediateMate(pieces: Piece[], move: Move, side: Side): boolean {
    const after = makeMove(pieces, move);
    const defender = oppositeSide(side);
    return isInCheck(after, defender) && getAllLegalMoves(after, defender).length === 0;
}

function allowsOpponentImmediateMate(pieces: Piece[], aiSide: Side): boolean {
    const opponent = oppositeSide(aiSide);
    return getAllLegalMoves(pieces, opponent).some(move => hasImmediateMate(pieces, move, opponent));
}

function isForcedScore(score: number): boolean {
    return Math.abs(score) > CHECKMATE_SCORE * 0.5;
}

function addRootRandomness(score: number): number {
    if (isForcedScore(score)) return score;
    return score + (Math.random() * 2 - 1) * ROOT_SCORE_JITTER;
}

function pickRootMove(
    scoredMoves: { move: Move; score: number; noisyScore: number }[],
    fallback: Move,
): { move: Move; score: number } {
    if (scoredMoves.length === 0) return { move: fallback, score: -Infinity };

    const bestScore = Math.max(...scoredMoves.map(item => item.score));
    if (isForcedScore(bestScore)) {
        const forced = scoredMoves.reduce((best, item) => (item.score > best.score ? item : best), scoredMoves[0]);
        return { move: forced.move, score: forced.score };
    }

    const closeMoves = scoredMoves.filter(item => item.score >= bestScore - ROOT_RANDOM_MARGIN);
    const selected = closeMoves.reduce(
        (best, item) =>
            item.noisyScore + rootMoveStyleScore(item.move) > best.noisyScore + rootMoveStyleScore(best.move)
                ? item
                : best,
        closeMoves[0],
    );
    return { move: selected.move, score: selected.score };
}

function forecastMoveThreatScore(pieces: Piece[], move: Move, side: Side): number {
    let score = 0;

    if (move.captured) {
        const exchangeRisk = moveExchangeRisk(pieces, move, side);
        score +=
            SURVIVAL_VALUES[move.captured.type] * 0.62 -
            exchangeRisk * 0.45 -
            oneMoveTradeLoss(pieces, move, side) * 0.62 -
            majorCaptureSacrificeRisk(pieces, move, side) * 0.86 -
            moveFreeCaptureRisk(pieces, move, side) * 0.74;
        if (move.captured.type === 'king') score += CHECKMATE_SCORE;
    }
    if (isMoveCheck(pieces, move, side)) score += 700;

    const after = makeMove(pieces, move);
    score += moveAggressionScore(pieces, move, side);
    score += centerCannonDefenseScore(pieces, move, side) * 0.7;
    score += forcingAttackScore(pieces, move, side) * 0.36;
    score += immediateMoveSurvivalSwing(pieces, move, side) * 0.45;

    const defender = oppositeSide(side);
    for (const p of after) {
        if (!p.alive || p.side !== defender || p.type === 'king') continue;
        const attackers = countAttackers(after, p.row, p.col, side);
        if (attackers === 0) continue;
        const defenders = countAttackers(after, p.row, p.col, defender);
        const attackerPressure = ATTACK_PIECES.has(move.piece.type) ? 1.15 : 0.85;
        if (defenders === 0) score += SURVIVAL_VALUES[p.type] * 0.3 * attackerPressure;
        else if (attackers > defenders) score += SURVIVAL_VALUES[p.type] * 0.18 * attackerPressure;
    }

    return score;
}

function getTopForecastMoves(pieces: Piece[], side: Side, limit: number): Move[] {
    return getAllLegalMoves(pieces, side)
        .map(move => ({ move, score: forecastMoveThreatScore(pieces, move, side) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(item => item.move);
}

function opponentMoveRisk(pieces: Piece[], move: Move, side: Side): number {
    if (hasImmediateMate(pieces, move, side)) return CHECKMATE_SCORE * 0.8;
    return forecastMoveThreatScore(pieces, move, side);
}

function forecastPlayerPlanRisk(
    pieces: Piece[],
    aiSide: Side,
    context: SearchContext,
    playerMovesLeft = PLAYER_FORECAST_DEPTH,
): number {
    if (checkTime(context)) return 0;
    if (playerMovesLeft <= 0) return sideSurvivalRisk(pieces, aiSide) * 0.3;

    const opponent = oppositeSide(aiSide);
    const playerLimit = playerMovesLeft >= 4 ? PLAYER_FORECAST_MOVE_LIMIT : Math.max(3, PLAYER_FORECAST_MOVE_LIMIT - 1);
    const replyLimit = playerMovesLeft >= 4 ? AI_FORECAST_REPLY_LIMIT : 2;
    const playerMoves = getTopForecastMoves(pieces, opponent, playerLimit);
    if (playerMoves.length === 0) return 0;

    let worstPlanRisk = 0;

    for (const playerMove of playerMoves) {
        if (checkTime(context)) break;

        const immediateRisk = opponentMoveRisk(pieces, playerMove, opponent);
        if (immediateRisk > CHECKMATE_SCORE * 0.5) return immediateRisk;

        const afterPlayer = makeMove(pieces, playerMove);
        const replies = getTopForecastMoves(afterPlayer, aiSide, replyLimit);
        if (replies.length === 0) return CHECKMATE_SCORE * 0.6;

        let bestContainedRisk = Infinity;
        for (const reply of replies) {
            if (checkTime(context)) break;

            const afterReply = makeMove(afterPlayer, reply);
            const survivalRisk = sideSurvivalRisk(afterReply, aiSide);
            const futureRisk = forecastPlayerPlanRisk(afterReply, aiSide, context, playerMovesLeft - 1);

            bestContainedRisk = Math.min(
                bestContainedRisk,
                immediateRisk * 0.42 + survivalRisk * 0.26 + futureRisk * FORECAST_DEPTH_DECAY,
            );
        }

        if (bestContainedRisk < Infinity) {
            worstPlanRisk = Math.max(worstPlanRisk, bestContainedRisk);
        }
    }

    return worstPlanRisk;
}

function getForecastRisk(context: SearchContext, pieces: Piece[], aiSide: Side): number {
    const key = `${aiSide}|${boardKey(pieces, oppositeSide(aiSide))}`;
    const cached = context.forecastRisk.get(key);
    if (cached !== undefined) return cached;
    const risk = forecastPlayerPlanRisk(pieces, aiSide, context);
    context.forecastRisk.set(key, risk);
    return risk;
}

// --- Position tables (red's perspective, flip for black) ---
const PST: Record<string, number[][]> = {
    king: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 1, 0, 0, 0, 0],
        [0, 0, 0, 2, 3, 2, 0, 0, 0],
        [0, 0, 0, 5, 6, 5, 0, 0, 0],
    ],
    advisor: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 2, 0, 2, 0, 0, 0],
        [0, 0, 0, 0, 3, 0, 0, 0, 0],
        [0, 0, 0, 5, 0, 5, 0, 0, 0],
    ],
    elephant: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 1, 0, 1, 0, 0, 0],
        [0, 0, 0, 0, 2, 0, 0, 0, 0],
        [1, 0, 2, 0, 0, 0, 2, 0, 1],
        [0, 0, 0, 0, 3, 0, 0, 0, 0],
        [1, 0, 2, 0, 0, 0, 2, 0, 1],
    ],
    horse: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 1, 2, 2, 2, 2, 2, 1, 0],
        [0, 2, 4, 4, 4, 4, 4, 2, 0],
        [1, 3, 5, 6, 6, 6, 5, 3, 1],
        [0, 2, 4, 6, 7, 6, 4, 2, 0],
        [0, 1, 2, 4, 5, 4, 2, 1, 0],
    ],
    rook: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 1, 1, 1, 1, 1, 0, 0],
        [0, 1, 2, 3, 4, 3, 2, 1, 0],
        [0, 1, 2, 4, 5, 4, 2, 1, 0],
        [0, 1, 3, 5, 7, 5, 3, 1, 0],
        [0, 2, 4, 6, 8, 6, 4, 2, 0],
        [0, 3, 5, 8, 10, 8, 5, 3, 0],
        [1, 4, 7, 10, 12, 10, 7, 4, 1],
        [2, 5, 8, 12, 14, 12, 8, 5, 2],
        [3, 6, 10, 14, 18, 14, 10, 6, 3],
    ],
    cannon: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 4, 6, 4, 0, 0, 0],
        [0, 0, 2, 5, 8, 5, 2, 0, 0],
        [0, 0, 3, 6, 10, 6, 3, 0, 0],
        [0, 1, 4, 8, 12, 8, 4, 1, 0],
        [0, 2, 5, 10, 14, 10, 5, 2, 0],
        [1, 3, 6, 10, 16, 10, 6, 3, 1],
        [1, 3, 6, 10, 18, 10, 6, 3, 1],
    ],
    pawn: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [2, 6, 12, 18, 18, 18, 12, 6, 2],
        [6, 12, 18, 30, 30, 30, 18, 12, 6],
        [10, 20, 30, 42, 42, 42, 30, 20, 10],
        [14, 26, 40, 50, 50, 50, 40, 26, 14],
        [18, 36, 56, 72, 72, 72, 56, 36, 18],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
};

function evaluate(pieces: Piece[], side: Side): number {
    const myKing = pieces.find(p => p.alive && p.type === 'king' && p.side === side);
    const oppKing = pieces.find(p => p.alive && p.type === 'king' && p.side !== side);
    if (!myKing) return -CHECKMATE_SCORE;
    if (!oppKing) return CHECKMATE_SCORE;

    let score = 0;
    let myMobility = 0;
    let oppMobility = 0;

    for (const p of pieces) {
        if (!p.alive) continue;
        const val = PIECE_VALUES[p.type];
        const isMyPiece = p.side === side;
        const sign = isMyPiece ? 1 : -1;

        score += sign * val;

        const evalRow = p.side === 'red' ? 9 - p.row : p.row;
        const pst = PST[p.type];
        if (pst && pst[evalRow]) {
            const pstWeight = p.type === 'pawn' ? 0.85 : ATTACK_PIECES.has(p.type) ? 2.65 : 1.8;
            score += sign * ((pst[evalRow][p.col] || 0) * pstWeight);
        }

        const moves = getValidMovesForPiece(p, pieces);
        if (isMyPiece) myMobility += moves.length;
        else oppMobility += moves.length;

        if (ATTACK_PIECES.has(p.type)) {
            const progress = forwardProgress(p.row, p.side);
            const activeScore =
                moves.length * (p.type === 'rook' ? 2.4 : p.type === 'cannon' ? 2.1 : 2.6) +
                progress * (p.type === 'horse' ? 4.2 : 3.4) +
                centralFileScore(p.col) * (p.type === 'cannon' ? 5.5 : 4.2) +
                enemyPalacePressureScore(p, pieces) * 0.45 -
                cannonPawnSandwichPenalty(p, pieces) * 0.52;
            score += sign * activeScore;

            if (p.type === 'rook' && isHomeRank(p.row, p.side)) score -= sign * 18;
            if (p.type === 'horse' && isHomeRank(p.row, p.side)) score -= sign * 14;
            if (p.type === 'cannon' && isCannonHomeRank(p.row, p.side)) score -= sign * 10;
        }

        const survivalRisk = pieceSurvivalRisk(pieces, p);
        score -= sign * survivalRisk * 0.32;
        if (p.type !== 'king') {
            const defenders = countAttackers(pieces, p.row, p.col, p.side);
            if (defenders > 0) {
                score += sign * Math.min(16, SURVIVAL_VALUES[p.type] * 0.018);
            }
        }
    }

    score += (myMobility - oppMobility) * 1.5;

    if (isInCheck(pieces, oppositeSide(side))) score += 45;
    if (isInCheck(pieces, side)) score -= 70;

    for (const p of pieces) {
        if (!p.alive || p.type !== 'pawn') continue;
        const sign = p.side === side ? 1 : -1;
        const crossed = p.side === 'red' ? p.row <= 4 : p.row >= 5;
        const progress = p.side === 'red' ? 9 - p.row : p.row;
        score += sign * (crossed ? 12 : 0);
        score += sign * progress * 0.9;
        if (crossed && p.col >= 3 && p.col <= 5) score += sign * 4;
    }

    for (const p of pieces) {
        if (!p.alive || p.type === 'king' || p.type === 'pawn') continue;
        const sign = p.side === side ? 1 : -1;
        const enemyPalaceRows = p.side === 'red' ? [0, 1, 2] : [7, 8, 9];
        const nearEnemyPalace = enemyPalaceRows.includes(p.row) && p.col >= 2 && p.col <= 6;
        if (nearEnemyPalace) score += sign * (ATTACK_PIECES.has(p.type) ? 24 : 6);
    }

    return score;
}

function checkTime(context: SearchContext): boolean {
    if (!context.timedOut && performance.now() - context.startTime > context.timeLimit) {
        context.timedOut = true;
    }
    return context.timedOut;
}

function rememberKiller(context: SearchContext, ply: number, move: Move) {
    if (move.captured) return;
    const key = moveKey(move);
    const killers = context.killerMoves.get(ply) || [];
    if (killers[0] === key) return;
    const next = [key, ...killers.filter(k => k !== key)].slice(0, 2);
    context.killerMoves.set(ply, next);
}

function rememberHistory(context: SearchContext, move: Move, depth: number) {
    if (move.captured) return;
    const key = moveKey(move);
    context.history.set(key, (context.history.get(key) || 0) + depth * depth);
}

function moveOrderScore(move: Move, pieces: Piece[], side: Side, context: SearchContext, ply: number): number {
    let score = 0;
    if (move.captured) {
        const exchangeRisk = moveExchangeRisk(pieces, move, side);
        score += 50_000 + SURVIVAL_VALUES[move.captured.type] * 34 - exchangeRisk * 36;
        score -= oneMoveTradeLoss(pieces, move, side) * 64;
        score -= majorCaptureSacrificeRisk(pieces, move, side) * 78;
        if (move.captured.type === 'king') score += CHECKMATE_SCORE;
    }

    if (isMoveCheck(pieces, move, side)) score += 18_000;

    const key = moveKey(move);
    const killers = context.killerMoves.get(ply) || [];
    if (killers[0] === key) score += 12_000;
    else if (killers[1] === key) score += 8_000;
    score += context.history.get(key) || 0;

    score += moveAggressionScore(pieces, move, side);
    score += centerCannonDefenseScore(pieces, move, side) * 6;
    score += immediateMoveSurvivalSwing(pieces, move, side) * 2.4;
    score += forcingAttackScore(pieces, move, side) * 1.8;
    score += initiativeScore(pieces, move, side) * 2.2;
    score -= moveExchangeRisk(pieces, move, side) * 1.7;
    score -= oneMoveTradeLoss(pieces, move, side) * 3.4;
    score -= majorCaptureSacrificeRisk(pieces, move, side) * 4.6;
    score -= moveFreeCaptureRisk(pieces, move, side) * 5.2;
    if (ATTACK_PIECES.has(move.piece.type)) score += 95;
    if (move.piece.type === 'pawn') score -= 35;

    return score;
}

function orderMoves(moves: Move[], pieces: Piece[], side: Side, context: SearchContext, ply: number): Move[] {
    const scored = moves.map(move => ({
        move,
        score: moveOrderScore(move, pieces, side, context, ply),
    }));
    scored.sort((a, b) => b.score - a.score);
    moves.splice(0, moves.length, ...scored.map(item => item.move));
    return moves;
}

function quiescenceSearch(
    pieces: Piece[],
    alpha: number,
    beta: number,
    maximizing: boolean,
    aiSide: Side,
    context: SearchContext,
    ply: number,
    depth: number,
): number {
    if (checkTime(context)) return evaluate(pieces, aiSide);

    const side = maximizing ? aiSide : oppositeSide(aiSide);
    let standPat = evaluate(pieces, aiSide);

    if (maximizing) {
        if (standPat >= beta) return beta;
        if (standPat > alpha) alpha = standPat;
    } else {
        if (standPat <= alpha) return alpha;
        if (standPat < beta) beta = standPat;
    }

    if (depth <= 0) return standPat;

    const tacticalMoves = getAllLegalMoves(pieces, side).filter(m => m.captured || isMoveCheck(pieces, m, side));
    if (tacticalMoves.length === 0) return standPat;

    orderMoves(tacticalMoves, pieces, side, context, ply);

    if (maximizing) {
        for (const move of tacticalMoves) {
            const score = quiescenceSearch(
                makeMove(pieces, move),
                alpha,
                beta,
                false,
                aiSide,
                context,
                ply + 1,
                depth - 1,
            );
            if (score > alpha) {
                alpha = score;
                if (alpha >= beta) break;
            }
        }
        return alpha;
    }

    for (const move of tacticalMoves) {
        const score = quiescenceSearch(makeMove(pieces, move), alpha, beta, true, aiSide, context, ply + 1, depth - 1);
        if (score < beta) {
            beta = score;
            if (alpha >= beta) break;
        }
    }
    return beta;
}

function minimax(
    pieces: Piece[],
    depth: number,
    alpha: number,
    beta: number,
    maximizing: boolean,
    aiSide: Side,
    context: SearchContext,
    ply = 0,
): number {
    context.nodes++;
    if (checkTime(context)) return evaluate(pieces, aiSide);

    const side = maximizing ? aiSide : oppositeSide(aiSide);
    const alphaOriginal = alpha;
    const betaOriginal = beta;
    const key = boardKey(pieces, side);
    const cached = context.table.get(key);
    if (cached && cached.depth >= depth) {
        if (cached.flag === 'exact') return cached.score;
        if (cached.flag === 'lower') alpha = Math.max(alpha, cached.score);
        else beta = Math.min(beta, cached.score);
        if (alpha >= beta) return cached.score;
    }

    const allMoves = getAllLegalMoves(pieces, side);
    if (allMoves.length === 0) {
        if (isInCheck(pieces, side)) {
            return side === aiSide ? -CHECKMATE_SCORE + ply : CHECKMATE_SCORE - ply;
        }
        return 0;
    }

    if (depth === 0) {
        return quiescenceSearch(pieces, alpha, beta, maximizing, aiSide, context, ply, QUIESCENCE_DEPTH);
    }

    orderMoves(allMoves, pieces, side, context, ply);

    let bestScore = maximizing ? -Infinity : Infinity;

    if (maximizing) {
        for (const move of allMoves) {
            const score = minimax(makeMove(pieces, move), depth - 1, alpha, beta, false, aiSide, context, ply + 1);
            if (context.timedOut) return bestScore === -Infinity ? evaluate(pieces, aiSide) : bestScore;
            bestScore = Math.max(bestScore, score);
            alpha = Math.max(alpha, score);
            if (alpha >= beta) {
                rememberKiller(context, ply, move);
                rememberHistory(context, move, depth);
                break;
            }
        }
    } else {
        for (const move of allMoves) {
            const score = minimax(makeMove(pieces, move), depth - 1, alpha, beta, true, aiSide, context, ply + 1);
            if (context.timedOut) return bestScore === Infinity ? evaluate(pieces, aiSide) : bestScore;
            bestScore = Math.min(bestScore, score);
            beta = Math.min(beta, score);
            if (alpha >= beta) {
                rememberKiller(context, ply, move);
                rememberHistory(context, move, depth);
                break;
            }
        }
    }

    const flag = bestScore <= alphaOriginal ? 'upper' : bestScore >= betaOriginal ? 'lower' : 'exact';
    context.table.set(key, { depth, score: bestScore, flag });
    return bestScore;
}

function aiFindBestMove(pieces: Piece[], aiSide: Side): Move | null {
    const allMoves = getAllLegalMoves(pieces, aiSide);
    if (allMoves.length === 0) return null;

    const context: SearchContext = {
        startTime: performance.now(),
        timeLimit: AI_TIME_LIMIT_MS,
        timedOut: false,
        nodes: 0,
        table: new Map(),
        killerMoves: new Map(),
        history: new Map(),
        forecastRisk: new Map(),
    };

    orderMoves(allMoves, pieces, aiSide, context, 0);

    for (const move of allMoves) {
        if (hasImmediateMate(pieces, move, aiSide)) return move;
    }

    const safeMoves = allMoves.filter(move => !allowsOpponentImmediateMate(makeMove(pieces, move), aiSide));
    const mateSafeMoves = safeMoves.length > 0 ? safeMoves : allMoves;
    const centerCannonDefenseMoves = mateSafeMoves.filter(
        move => centerCannonDefenseScore(pieces, move, aiSide) >= CENTER_CANNON_DEFENSE_BONUS,
    );
    const strategicMoves = centerCannonDefenseMoves.length > 0 ? centerCannonDefenseMoves : mateSafeMoves;
    const majorSafeMoves = strategicMoves.filter(move => {
        const sacrificeRisk = majorCaptureSacrificeRisk(pieces, move, aiSide);
        if (sacrificeRisk === 0) return true;
        return (
            isMoveCheck(pieces, move, aiSide) &&
            forcingAttackScore(pieces, move, aiSide) >= MAJOR_CAPTURE_FORCING_THRESHOLD
        );
    });
    const freeCaptureSafeMoves = majorSafeMoves.filter(move => {
        const risk = moveFreeCaptureRisk(pieces, move, aiSide);
        return risk < 260 || hasImmediateMate(pieces, move, aiSide) || isMoveCheck(pieces, move, aiSide);
    });
    const initiativeMoves = freeCaptureSafeMoves.filter(move => initiativeScore(pieces, move, aiSide) >= 260);
    const guardedMoves = mateSafeMoves.filter(move => {
        const after = makeMove(pieces, move);
        const moved = getPieceAt(after, move.toRow, move.toCol);
        if (!moved || !ATTACK_PIECES.has(moved.type)) return true;
        return (
            moveExchangeRisk(pieces, move, aiSide) < SURVIVAL_VALUES[moved.type] * 0.58 ||
            (move.captured && oneMoveTradeLoss(pieces, move, aiSide) < SURVIVAL_VALUES[moved.type] * 0.22) ||
            centerCannonDefenseScore(pieces, move, aiSide) > 0 ||
            forcingAttackScore(pieces, move, aiSide) > 520
        );
    });
    const candidateMoves =
        centerCannonDefenseMoves.length > 0
            ? centerCannonDefenseMoves
            : initiativeMoves.length > 0
              ? initiativeMoves
              : freeCaptureSafeMoves.length > 0
                ? freeCaptureSafeMoves
                : majorSafeMoves.length > 0
                  ? majorSafeMoves
                  : guardedMoves.length > 0
                    ? guardedMoves
                    : strategicMoves;

    let bestMove: Move = candidateMoves[0];
    let bestScore = -Infinity;

    for (let depth = 1; depth <= MAX_SEARCH_DEPTH; depth++) {
        if (checkTime(context)) break;

        const scoredRootMoves: { move: Move; score: number; noisyScore: number }[] = [];
        let completed = true;

        const rootMoves = [...candidateMoves].sort((a, b) => {
            if (a === bestMove) return -1;
            if (b === bestMove) return 1;
            return moveOrderScore(b, pieces, aiSide, context, 0) - moveOrderScore(a, pieces, aiSide, context, 0);
        });

        for (const move of rootMoves) {
            if (checkTime(context)) {
                completed = false;
                break;
            }
            const afterMove = makeMove(pieces, move);
            const forecastPenalty = getForecastRisk(context, afterMove, aiSide) * FIVE_MOVE_FORECAST_WEIGHT;
            if (context.timedOut) {
                completed = false;
                break;
            }
            const survivalAdjustment = immediateMoveSurvivalSwing(pieces, move, aiSide) * ROOT_SURVIVAL_WEIGHT;
            const attackAdjustment = rootAttackScore(pieces, move, aiSide) * ROOT_ATTACK_WEIGHT;
            const forcingAdjustment = forcingAttackScore(pieces, move, aiSide) * ROOT_FORCING_WEIGHT;
            const initiativeAdjustment = initiativeScore(pieces, move, aiSide) * ROOT_INITIATIVE_WEIGHT;
            const exchangeRiskPenalty = moveExchangeRisk(pieces, move, aiSide) * ROOT_EXCHANGE_RISK_WEIGHT;
            const tradeLossPenalty = oneMoveTradeLoss(pieces, move, aiSide) * ROOT_TRADE_LOSS_WEIGHT;
            const majorSacrificePenalty =
                majorCaptureSacrificeRisk(pieces, move, aiSide) * ROOT_MAJOR_CAPTURE_SACRIFICE_WEIGHT;
            const freeCapturePenalty = moveFreeCaptureRisk(pieces, move, aiSide) * ROOT_FREE_CAPTURE_WEIGHT;
            const centerDefenseAdjustment = centerCannonDefenseScore(pieces, move, aiSide);
            const exposedPenalty = sideSurvivalRisk(afterMove, aiSide) * 0.26;
            const movedAfter = getPieceAt(afterMove, move.toRow, move.toCol);
            const cannonShapePenalty = movedAfter ? cannonPawnSandwichPenalty(movedAfter, afterMove) * 1.35 : 0;
            const score =
                minimax(afterMove, depth - 1, -Infinity, Infinity, false, aiSide, context, 1) +
                survivalAdjustment +
                attackAdjustment +
                centerDefenseAdjustment -
                exchangeRiskPenalty -
                tradeLossPenalty +
                forcingAdjustment +
                initiativeAdjustment -
                majorSacrificePenalty -
                freeCapturePenalty -
                cannonShapePenalty -
                forecastPenalty -
                exposedPenalty;
            if (context.timedOut) {
                completed = false;
                break;
            }
            scoredRootMoves.push({ move, score, noisyScore: addRootRandomness(score) });
        }

        if (completed && scoredRootMoves.length > 0) {
            const selected = pickRootMove(scoredRootMoves, bestMove);
            bestMove = selected.move;
            bestScore = selected.score;
            if (bestScore > CHECKMATE_SCORE * 0.9) break;
        } else {
            break;
        }
    }

    return bestMove;
}

export function useChineseChess() {
    const pieces = ref<Piece[]>([]);
    const currentSide = ref<Side>('red');
    const gameStatus = ref<'idle' | 'playing' | 'ended'>('idle');
    const playerSide = ref<Side>('red');
    const difficulty = ref<ChessDifficulty>('hard');
    const selectedPiece = ref<Piece | null>(null);
    const validMoves = ref<[number, number][]>([]);
    const message = ref('');
    const moveHistory = ref<string[]>([]);
    const lastMove = ref<Move | null>(null);
    const setupAnimationStart = ref(0);
    let setupOrder = new WeakMap<Piece, number>();

    let aiTimer: ReturnType<typeof setTimeout> | null = null;
    let movingAnimation: MovingAnimation | null = null;
    let captureAnimation: CaptureAnimation | null = null;

    function setDifficulty(nextDifficulty: ChessDifficulty) {
        difficulty.value = nextDifficulty;
    }

    function startGame() {
        pieces.value = createInitialPieces();
        setupAnimationStart.value = performance.now();
        setupOrder = new WeakMap<Piece, number>();
        pieces.value.forEach((piece, index) => setupOrder.set(piece, index));
        movingAnimation = null;
        captureAnimation = null;
        currentSide.value = 'red';
        playerSide.value = 'red';
        selectedPiece.value = null;
        validMoves.value = [];
        message.value = '红方先行，请走棋';
        moveHistory.value = [];
        lastMove.value = null;
        gameStatus.value = 'playing';
        clearAITimer();
    }

    function clearAITimer() {
        if (aiTimer !== null) {
            clearTimeout(aiTimer);
            aiTimer = null;
        }
    }

    function boardToCanvas(row: number, col: number): [number, number] {
        return [BOARD_PADDING + col * CELL_SIZE, BOARD_PADDING + row * CELL_SIZE];
    }

    function easeOutCubic(t: number): number {
        return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
    }

    function easeBackOut(t: number): number {
        const clamped = Math.max(0, Math.min(1, t));
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(clamped - 1, 3) + c1 * Math.pow(clamped - 1, 2);
    }

    function drawPieceAt(
        ctx: CanvasRenderingContext2D,
        piece: Piece,
        cx: number,
        cy: number,
        options: { alpha?: number; scale?: number; selected?: boolean; lastMove?: boolean } = {},
    ) {
        const alpha = options.alpha ?? 1;
        const scale = options.scale ?? 1;

        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);

        if (options.selected) {
            ctx.beginPath();
            ctx.arc(0, 0, CELL_SIZE * 0.5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 216, 94, 0.28)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 225, 127, 0.9)';
            ctx.lineWidth = 3;
            ctx.stroke();
        }

        ctx.save();
        ctx.shadowColor = 'rgba(49, 19, 8, 0.48)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 4;
        ctx.beginPath();
        ctx.arc(0, 0, CELL_SIZE * 0.415, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(-7, -8, 3, 0, 0, CELL_SIZE * 0.43);
        grad.addColorStop(0, '#fff6dc');
        grad.addColorStop(0.55, '#ead09c');
        grad.addColorStop(1, '#b5793f');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(0, 0, CELL_SIZE * 0.415, 0, Math.PI * 2);
        ctx.strokeStyle = piece.side === 'red' ? '#9f241b' : '#34251c';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, CELL_SIZE * 0.32, 0, Math.PI * 2);
        ctx.strokeStyle = piece.side === 'red' ? 'rgba(198, 40, 40, 0.58)' : 'rgba(35, 30, 26, 0.58)';
        ctx.lineWidth = 1.6;
        ctx.stroke();

        if (options.lastMove) {
            ctx.beginPath();
            ctx.arc(0, 0, CELL_SIZE * 0.49, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 226, 121, 0.9)';
            ctx.lineWidth = 2.5;
            ctx.stroke();
        }

        ctx.fillStyle = piece.side === 'red' ? '#c62828' : '#1a1a2e';
        ctx.font = `900 ${CELL_SIZE * 0.39}px "KaiTi", "STKaiti", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const name = PIECE_NAMES[piece.side][piece.type];
        ctx.shadowColor = 'rgba(255, 245, 220, 0.46)';
        ctx.shadowBlur = 1;
        ctx.fillText(name, 0, 1);
        ctx.restore();
    }

    function canvasToBoard(mx: number, my: number): [number, number] | null {
        const col = Math.round((mx - BOARD_PADDING) / CELL_SIZE);
        const row = Math.round((my - BOARD_PADDING) / CELL_SIZE);
        if (!isInBoard(row, col)) return null;
        const [cx, cy] = boardToCanvas(row, col);
        const dist = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2);
        if (dist > CELL_SIZE * 0.45) return null;
        return [row, col];
    }

    function handleClick(mx: number, my: number) {
        if (gameStatus.value !== 'playing' || currentSide.value !== playerSide.value) return;

        const pos = canvasToBoard(mx, my);
        if (!pos) {
            selectedPiece.value = null;
            validMoves.value = [];
            return;
        }
        const [row, col] = pos;

        if (selectedPiece.value) {
            const isValid = validMoves.value.some(([r, c]) => r === row && c === col);
            if (isValid) {
                const captured = getPieceAt(pieces.value, row, col);
                const move: Move = {
                    piece: selectedPiece.value,
                    fromRow: selectedPiece.value.row,
                    fromCol: selectedPiece.value.col,
                    toRow: row,
                    toCol: col,
                    captured,
                };
                executeMove(move);
                return;
            }

            const clickedPiece = getPieceAt(pieces.value, row, col);
            if (clickedPiece && clickedPiece.side === playerSide.value) {
                selectedPiece.value = clickedPiece;
                validMoves.value = getLegalMovesForPiece(clickedPiece, pieces.value);
                return;
            }

            selectedPiece.value = null;
            validMoves.value = [];
            return;
        }

        const clickedPiece = getPieceAt(pieces.value, row, col);
        if (clickedPiece && clickedPiece.side === playerSide.value) {
            selectedPiece.value = clickedPiece;
            validMoves.value = getLegalMovesForPiece(clickedPiece, pieces.value);
        }
    }

    function getMoveLabel(piece: Piece, tr: number, tc: number): string {
        const name = PIECE_NAMES[piece.side][piece.type];
        const dir = tr < piece.row ? '进' : tr > piece.row ? '退' : tc > piece.col ? '进' : '退';
        const cols = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
        const colsBlack = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
        const colNames = piece.side === 'red' ? cols : colsBlack;
        const fromCol = colNames[piece.col];
        const targetCol = colNames[tc];
        if (piece.type === 'horse' || piece.type === 'elephant' || piece.type === 'advisor') {
            return `${name}${fromCol}${dir}${targetCol}`;
        }
        const dist = Math.abs(
            piece.type === 'rook' || piece.type === 'cannon' || piece.type === 'king' || piece.type === 'pawn'
                ? tr !== piece.row
                    ? Math.abs(tr - piece.row)
                    : Math.abs(tc - piece.col)
                : 0,
        );
        const distStr =
            piece.side === 'red'
                ? ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'][dist] || `${dist}`
                : `${dist}`;
        return `${name}${fromCol}${dir}${distStr}`;
    }

    function executeMove(move: Move) {
        const piece = pieces.value.find(p => p === move.piece);
        if (!piece) return;

        const now = performance.now();
        movingAnimation = {
            piece,
            fromRow: move.fromRow,
            fromCol: move.fromCol,
            toRow: move.toRow,
            toCol: move.toCol,
            startTime: now,
            duration: MOVE_ANIMATION_DURATION,
        };
        captureAnimation = move.captured
            ? {
                  piece: { ...move.captured },
                  row: move.toRow,
                  col: move.toCol,
                  startTime: now + MOVE_ANIMATION_DURATION * 0.45,
                  duration: CAPTURE_ANIMATION_DURATION,
              }
            : null;

        piece.row = move.toRow;
        piece.col = move.toCol;
        if (move.captured) {
            const cap = pieces.value.find(
                p =>
                    p.row === move.captured!.row &&
                    p.col === move.captured!.col &&
                    p.side === move.captured!.side &&
                    p.type === move.captured!.type &&
                    p.alive,
            );
            if (cap) cap.alive = false;
        }

        lastMove.value = move;
        selectedPiece.value = null;
        validMoves.value = [];

        const label = getMoveLabel(move.piece, move.toRow, move.toCol);
        const sideLabel = currentSide.value === 'red' ? '红' : '黑';
        moveHistory.value.push(`${sideLabel}: ${label}`);

        const oppSide = currentSide.value === 'red' ? 'black' : 'red';
        const oppKing = pieces.value.find(p => p.alive && p.type === 'king' && p.side !== currentSide.value);
        if (!oppKing) {
            const winner = currentSide.value === 'red' ? '红方' : '黑方';
            message.value = `${winner} 获胜！`;
            gameStatus.value = 'ended';
            clearAITimer();
            return;
        }

        if (isCheckmate(pieces.value, oppSide)) {
            const winner = currentSide.value === 'red' ? '红方' : '黑方';
            message.value = `${winner} 将死获胜！`;
            gameStatus.value = 'ended';
            clearAITimer();
            return;
        }

        if (isStalemate(pieces.value, oppSide)) {
            message.value = '困毙！和棋';
            gameStatus.value = 'ended';
            clearAITimer();
            return;
        }

        currentSide.value = currentSide.value === 'red' ? 'black' : 'red';

        const isCheck = isInCheck(pieces.value, currentSide.value);
        if (currentSide.value !== playerSide.value) {
            message.value = isCheck ? '将军！电脑思考中...' : '电脑思考中...';
            scheduleAIMove();
        } else {
            message.value = isCheck ? '将军！请应将' : '轮到你走棋';
        }
    }

    function scheduleAIMove() {
        clearAITimer();
        aiTimer = setTimeout(
            async () => {
                if (gameStatus.value !== 'playing') return;
                const aiSide = playerSide.value === 'red' ? 'black' : 'red';

                if (difficulty.value === 'easy') {
                    const move = aiFindBestMove(pieces.value, aiSide);
                    if (move) {
                        executeMove(move);
                    } else {
                        message.value = '电脑无棋可走，你赢了！';
                        gameStatus.value = 'ended';
                    }
                    return;
                }

                const positionSnapshot = boardKey(pieces.value, aiSide);
                const engineMove = await findPikafishMove(pieces.value, aiSide);
                if (gameStatus.value !== 'playing' || currentSide.value !== aiSide) return;

                if (boardKey(pieces.value, aiSide) !== positionSnapshot) {
                    message.value = '局面已变化，Pikafish 重新思考中...';
                    scheduleAIMove();
                    return;
                }

                if (engineMove) {
                    executeMove(engineMove);
                    return;
                }

                message.value = 'Pikafish 没有返回有效走法，请确认引擎已启动';
                gameStatus.value = 'ended';
            },
            600 + Math.random() * 400,
        );
    }

    function draw(ctx: CanvasRenderingContext2D) {
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

        const boardX = BOARD_PADDING - 20;
        const boardY = BOARD_PADDING - 20;
        const boardW = 8 * CELL_SIZE + 40;
        const boardH = 9 * CELL_SIZE + 40;
        const gridColor = '#633915';
        const accentColor = '#9d2c1f';

        const boardGrad = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H);
        boardGrad.addColorStop(0, '#e7bd7b');
        boardGrad.addColorStop(0.45, '#d99b56');
        boardGrad.addColorStop(1, '#b96e34');
        ctx.fillStyle = boardGrad;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.strokeStyle = '#fff0c0';
        ctx.lineWidth = 1;
        for (let y = 12; y < CANVAS_H; y += 19) {
            ctx.beginPath();
            ctx.moveTo(8, y + (y % 3));
            ctx.bezierCurveTo(150, y - 5, 290, y + 7, CANVAS_W - 8, y - 2);
            ctx.stroke();
        }
        ctx.restore();

        ctx.fillStyle = 'rgba(80, 36, 13, 0.16)';
        ctx.fillRect(boardX, boardY, boardW, boardH);
        ctx.strokeStyle = '#3f210d';
        ctx.lineWidth = 4;
        ctx.strokeRect(boardX, boardY, boardW, boardH);
        ctx.strokeStyle = 'rgba(255, 232, 171, 0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(boardX + 5, boardY + 5, boardW - 10, boardH - 10);

        const riverY = BOARD_PADDING + 4 * CELL_SIZE;
        const riverGrad = ctx.createLinearGradient(BOARD_PADDING, riverY, BOARD_PADDING, riverY + CELL_SIZE);
        riverGrad.addColorStop(0, 'rgba(102, 45, 18, 0.1)');
        riverGrad.addColorStop(0.5, 'rgba(255, 226, 161, 0.26)');
        riverGrad.addColorStop(1, 'rgba(102, 45, 18, 0.1)');
        ctx.fillStyle = riverGrad;
        ctx.fillRect(BOARD_PADDING, riverY, 8 * CELL_SIZE, CELL_SIZE);

        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1.45;

        for (let r = 0; r < 10; r++) {
            const y = BOARD_PADDING + r * CELL_SIZE;
            ctx.beginPath();
            ctx.moveTo(BOARD_PADDING, y);
            ctx.lineTo(BOARD_PADDING + 8 * CELL_SIZE, y);
            ctx.stroke();
        }

        for (let c = 0; c < 9; c++) {
            const x = BOARD_PADDING + c * CELL_SIZE;
            ctx.beginPath();
            ctx.moveTo(x, BOARD_PADDING);
            ctx.lineTo(x, BOARD_PADDING + 4 * CELL_SIZE);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x, BOARD_PADDING + 5 * CELL_SIZE);
            ctx.lineTo(x, BOARD_PADDING + 9 * CELL_SIZE);
            ctx.stroke();
        }

        ctx.strokeStyle = '#4a250d';
        ctx.lineWidth = 2.3;
        ctx.strokeRect(BOARD_PADDING, BOARD_PADDING, 8 * CELL_SIZE, 9 * CELL_SIZE);

        ctx.fillStyle = 'rgba(122, 40, 24, 0.08)';
        ctx.fillRect(BOARD_PADDING + 3 * CELL_SIZE, BOARD_PADDING, 2 * CELL_SIZE, 2 * CELL_SIZE);
        ctx.fillRect(BOARD_PADDING + 3 * CELL_SIZE, BOARD_PADDING + 7 * CELL_SIZE, 2 * CELL_SIZE, 2 * CELL_SIZE);

        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        ctx.moveTo(BOARD_PADDING + 3 * CELL_SIZE, BOARD_PADDING);
        ctx.lineTo(BOARD_PADDING + 5 * CELL_SIZE, BOARD_PADDING + 2 * CELL_SIZE);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(BOARD_PADDING + 5 * CELL_SIZE, BOARD_PADDING);
        ctx.lineTo(BOARD_PADDING + 3 * CELL_SIZE, BOARD_PADDING + 2 * CELL_SIZE);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(BOARD_PADDING + 3 * CELL_SIZE, BOARD_PADDING + 7 * CELL_SIZE);
        ctx.lineTo(BOARD_PADDING + 5 * CELL_SIZE, BOARD_PADDING + 9 * CELL_SIZE);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(BOARD_PADDING + 5 * CELL_SIZE, BOARD_PADDING + 7 * CELL_SIZE);
        ctx.lineTo(BOARD_PADDING + 3 * CELL_SIZE, BOARD_PADDING + 9 * CELL_SIZE);
        ctx.stroke();

        const drawMarker = (row: number, col: number) => {
            const [x, y] = boardToCanvas(row, col);
            ctx.save();
            ctx.strokeStyle = 'rgba(86, 42, 15, 0.72)';
            ctx.lineWidth = 1.2;
            const gap = 5;
            const len = 12;
            const left = col > 0;
            const right = col < 8;
            if (left) {
                ctx.beginPath();
                ctx.moveTo(x - gap, y - gap);
                ctx.lineTo(x - len, y - gap);
                ctx.moveTo(x - gap, y - gap);
                ctx.lineTo(x - gap, y - len);
                ctx.moveTo(x - gap, y + gap);
                ctx.lineTo(x - len, y + gap);
                ctx.moveTo(x - gap, y + gap);
                ctx.lineTo(x - gap, y + len);
                ctx.stroke();
            }
            if (right) {
                ctx.beginPath();
                ctx.moveTo(x + gap, y - gap);
                ctx.lineTo(x + len, y - gap);
                ctx.moveTo(x + gap, y - gap);
                ctx.lineTo(x + gap, y - len);
                ctx.moveTo(x + gap, y + gap);
                ctx.lineTo(x + len, y + gap);
                ctx.moveTo(x + gap, y + gap);
                ctx.lineTo(x + gap, y + len);
                ctx.stroke();
            }
            ctx.restore();
        };

        [
            [2, 1],
            [2, 7],
            [3, 0],
            [3, 2],
            [3, 4],
            [3, 6],
            [3, 8],
            [6, 0],
            [6, 2],
            [6, 4],
            [6, 6],
            [6, 8],
            [7, 1],
            [7, 7],
        ].forEach(([row, col]) => drawMarker(row, col));

        ctx.fillStyle = 'rgba(72, 31, 12, 0.82)';
        ctx.font = 'bold 19px "KaiTi", "STKaiti", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const riverTextY = BOARD_PADDING + 4.5 * CELL_SIZE;
        ctx.fillText('楚  河', BOARD_PADDING + 2 * CELL_SIZE, riverTextY);
        ctx.fillText('漢  界', BOARD_PADDING + 6 * CELL_SIZE, riverTextY);

        if (lastMove.value) {
            const drawMoveBox = (row: number, col: number, color: string) => {
                const [x, y] = boardToCanvas(row, col);
                const s = CELL_SIZE * 0.38;
                ctx.save();
                ctx.strokeStyle = color;
                ctx.lineWidth = 3;
                ctx.shadowColor = color;
                ctx.shadowBlur = 10;
                ctx.strokeRect(x - s, y - s, s * 2, s * 2);
                ctx.restore();
            };
            drawMoveBox(lastMove.value.fromRow, lastMove.value.fromCol, 'rgba(255, 224, 131, 0.78)');
            drawMoveBox(lastMove.value.toRow, lastMove.value.toCol, 'rgba(202, 58, 38, 0.82)');
        }

        for (const [r, c] of validMoves.value) {
            const [cx, cy] = boardToCanvas(r, c);
            const target = getPieceAt(pieces.value, r, c);
            ctx.save();
            if (target) {
                ctx.beginPath();
                ctx.arc(cx, cy, CELL_SIZE * 0.43, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(191, 42, 27, 0.16)';
                ctx.fill();
                ctx.strokeStyle = 'rgba(191, 42, 27, 0.8)';
                ctx.lineWidth = 3;
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.arc(cx, cy, 7, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(65, 38, 18, 0.48)';
                ctx.fill();
                ctx.beginPath();
                ctx.arc(cx, cy, 13, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(255, 226, 161, 0.55)';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
            ctx.restore();
        }

        const now = performance.now();
        for (const piece of pieces.value) {
            if (!piece.alive) continue;
            if (movingAnimation?.piece === piece) continue;

            const [targetX, targetY] = boardToCanvas(piece.row, piece.col);
            let cx = targetX;
            let cy = targetY;
            let alpha = 1;
            let scale = 1;

            const setupIndex = setupOrder.get(piece);
            if (setupIndex !== undefined && setupAnimationStart.value > 0) {
                const startDelay = setupIndex * SETUP_ANIMATION_STAGGER;
                const progress = (now - setupAnimationStart.value - startDelay) / SETUP_ANIMATION_DURATION;
                if (progress < 1) {
                    const eased = easeBackOut(progress);
                    const sideOffset = piece.side === 'red' ? 72 : -72;
                    cy = targetY + sideOffset * (1 - easeOutCubic(progress));
                    alpha = Math.max(0, Math.min(1, progress * 1.4));
                    scale = 0.72 + Math.max(0, eased) * 0.28;
                }
            }

            const isSelected = selectedPiece.value === piece;
            const isLastMove =
                lastMove.value &&
                (lastMove.value.piece === piece ||
                    (lastMove.value.toRow === piece.row && lastMove.value.toCol === piece.col));
            drawPieceAt(ctx, piece, cx, cy, { alpha, scale, selected: isSelected, lastMove: !!isLastMove });
        }

        if (captureAnimation) {
            const progress = (now - captureAnimation.startTime) / captureAnimation.duration;
            if (progress < 1) {
                const [cx, cy] = boardToCanvas(captureAnimation.row, captureAnimation.col);
                drawPieceAt(ctx, captureAnimation.piece, cx, cy - easeOutCubic(progress) * 18, {
                    alpha: 1 - Math.max(0, progress),
                    scale: 1 + easeOutCubic(progress) * 0.22,
                });
            } else {
                captureAnimation = null;
            }
        }

        if (movingAnimation) {
            const progress = (now - movingAnimation.startTime) / movingAnimation.duration;
            if (progress < 1) {
                const eased = easeOutCubic(progress);
                const [fromX, fromY] = boardToCanvas(movingAnimation.fromRow, movingAnimation.fromCol);
                const [toX, toY] = boardToCanvas(movingAnimation.toRow, movingAnimation.toCol);
                drawPieceAt(
                    ctx,
                    movingAnimation.piece,
                    fromX + (toX - fromX) * eased,
                    fromY + (toY - fromY) * eased - Math.sin(Math.PI * Math.max(0, progress)) * 8,
                    { scale: 1.05, lastMove: true },
                );
            } else {
                movingAnimation = null;
            }
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
        pieces,
        currentSide,
        gameStatus,
        playerSide,
        selectedPiece,
        validMoves,
        difficulty,
        message,
        moveHistory,
        lastMove,
        setDifficulty,
        startGame,
        handleClick,
        draw,
        getWidth,
        getHeight,
        clearAITimer,
    };
}
