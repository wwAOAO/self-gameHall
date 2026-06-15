import { computed, onUnmounted, ref } from 'vue';

type PlayerId = 0 | 1 | 2 | 3;
type Phase = 'idle' | 'rolling' | 'selecting' | 'moving' | 'ended';

export interface BoardPoint {
    x: number;
    y: number;
}

export interface LudoPiece {
    id: number;
    step: number;
}

export interface LudoPlayer {
    id: PlayerId;
    name: string;
    shortName: string;
    color: string;
    accent: string;
    isAI: boolean;
    startIndex: number;
    pieces: LudoPiece[];
}

export interface BoardCell extends BoardPoint {
    key: string;
}

export interface PieceView {
    player: PlayerId;
    piece: LudoPiece;
}

const BOARD_SIZE = 15;
const TRACK_LENGTH = 48;
const FINAL_LENGTH = 6;
const FINISH_STEP = TRACK_LENGTH + FINAL_LENGTH - 1;
const HUMAN_PLAYER: PlayerId = 0;

const MAIN_PATH: BoardPoint[] = [
    ...Array.from({ length: 13 }, (_, i) => ({ x: i + 1, y: 1 })),
    ...Array.from({ length: 12 }, (_, i) => ({ x: 13, y: i + 2 })),
    ...Array.from({ length: 12 }, (_, i) => ({ x: 12 - i, y: 13 })),
    ...Array.from({ length: 11 }, (_, i) => ({ x: 1, y: 12 - i })),
];

const FINAL_LANES: Record<PlayerId, BoardPoint[]> = {
    0: [
        { x: 2, y: 7 },
        { x: 3, y: 7 },
        { x: 4, y: 7 },
        { x: 5, y: 7 },
        { x: 6, y: 7 },
        { x: 7, y: 7 },
    ],
    1: [
        { x: 7, y: 2 },
        { x: 7, y: 3 },
        { x: 7, y: 4 },
        { x: 7, y: 5 },
        { x: 7, y: 6 },
        { x: 7, y: 7 },
    ],
    2: [
        { x: 12, y: 7 },
        { x: 11, y: 7 },
        { x: 10, y: 7 },
        { x: 9, y: 7 },
        { x: 8, y: 7 },
        { x: 7, y: 7 },
    ],
    3: [
        { x: 7, y: 12 },
        { x: 7, y: 11 },
        { x: 7, y: 10 },
        { x: 7, y: 9 },
        { x: 7, y: 8 },
        { x: 7, y: 7 },
    ],
};

const HOME_POINTS: Record<PlayerId, BoardPoint[]> = {
    0: [
        { x: 2, y: 11 },
        { x: 3, y: 11 },
        { x: 2, y: 12 },
        { x: 3, y: 12 },
    ],
    1: [
        { x: 2, y: 2 },
        { x: 3, y: 2 },
        { x: 2, y: 3 },
        { x: 3, y: 3 },
    ],
    2: [
        { x: 11, y: 2 },
        { x: 12, y: 2 },
        { x: 11, y: 3 },
        { x: 12, y: 3 },
    ],
    3: [
        { x: 11, y: 11 },
        { x: 12, y: 11 },
        { x: 11, y: 12 },
        { x: 12, y: 12 },
    ],
};

const PLAYER_META = [
    { name: '你', shortName: '红', color: 'red', accent: '#ef4444', isAI: false, startIndex: 43 },
    { name: 'AI 蓝翼', shortName: '蓝', color: 'blue', accent: '#3b82f6', isAI: true, startIndex: 7 },
    { name: 'AI 绿航', shortName: '绿', color: 'green', accent: '#22c55e', isAI: true, startIndex: 19 },
    { name: 'AI 金雀', shortName: '黄', color: 'yellow', accent: '#f59e0b', isAI: true, startIndex: 31 },
] as const;

const BOARD_CELLS: BoardCell[] = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, i) => {
    const x = (i % BOARD_SIZE) + 1;
    const y = Math.floor(i / BOARD_SIZE) + 1;
    return { x, y, key: `${x}-${y}` };
});

function samePoint(a: BoardPoint, b: BoardPoint): boolean {
    return a.x === b.x && a.y === b.y;
}

function makePlayers(): LudoPlayer[] {
    return PLAYER_META.map((meta, index) => ({
        id: index as PlayerId,
        name: meta.name,
        shortName: meta.shortName,
        color: meta.color,
        accent: meta.accent,
        isAI: meta.isAI,
        startIndex: meta.startIndex,
        pieces: Array.from({ length: 4 }, (_, id) => ({ id, step: -1 })),
    }));
}

function nextPlayerId(player: PlayerId): PlayerId {
    return ((player + 1) % 4) as PlayerId;
}

function pieceCanMove(piece: LudoPiece, dice: number): boolean {
    if (piece.step >= FINISH_STEP) return false;
    if (piece.step < 0) return dice === 6;
    return piece.step + dice <= FINISH_STEP;
}

export function useLudo() {
    const players = ref<LudoPlayer[]>(makePlayers());
    const currentPlayer = ref<PlayerId>(HUMAN_PLAYER);
    const phase = ref<Phase>('idle');
    const dice = ref<number | null>(null);
    const message = ref('准备起飞');
    const winner = ref<PlayerId | null>(null);
    const lastMove = ref<{ player: PlayerId; piece: number } | null>(null);
    const eventLog = ref<string[]>([]);

    let aiTimer: ReturnType<typeof setTimeout> | null = null;

    const activePlayer = computed(() => players.value[currentPlayer.value]);
    const legalMoves = computed(() => {
        if (dice.value === null || phase.value === 'idle' || phase.value === 'ended') return [];
        return activePlayer.value.pieces.filter(piece => pieceCanMove(piece, dice.value ?? 0)).map(piece => piece.id);
    });
    const canHumanRoll = computed(
        () => phase.value === 'rolling' && currentPlayer.value === HUMAN_PLAYER && !activePlayer.value.isAI,
    );
    const canHumanMove = computed(
        () => phase.value === 'selecting' && currentPlayer.value === HUMAN_PLAYER && legalMoves.value.length > 0,
    );
    const boardCells = computed(() => BOARD_CELLS);

    function clearTimers() {
        if (aiTimer !== null) {
            clearTimeout(aiTimer);
            aiTimer = null;
        }
    }

    function log(text: string) {
        eventLog.value = [text, ...eventLog.value].slice(0, 5);
    }

    function startGame() {
        clearTimers();
        players.value = makePlayers();
        currentPlayer.value = HUMAN_PLAYER;
        phase.value = 'rolling';
        dice.value = null;
        winner.value = null;
        lastMove.value = null;
        eventLog.value = [];
        message.value = '轮到你投骰';
    }

    function getPiecePoint(playerId: PlayerId, piece: LudoPiece): BoardPoint {
        if (piece.step < 0) return HOME_POINTS[playerId][piece.id];
        if (piece.step >= FINISH_STEP) return { x: 7, y: 7 };
        if (piece.step >= TRACK_LENGTH) return FINAL_LANES[playerId][piece.step - TRACK_LENGTH];

        const player = players.value[playerId];
        return MAIN_PATH[(player.startIndex + piece.step) % TRACK_LENGTH];
    }

    function getPiecesAt(cell: BoardPoint): PieceView[] {
        return players.value.flatMap(player =>
            player.pieces
                .filter(piece => samePoint(getPiecePoint(player.id, piece), cell))
                .map(piece => ({ player: player.id, piece })),
        );
    }

    function isTrackCell(cell: BoardPoint): boolean {
        return MAIN_PATH.some(point => samePoint(point, cell));
    }

    function isStartCell(cell: BoardPoint): boolean {
        return players.value.some(player => samePoint(MAIN_PATH[player.startIndex], cell));
    }

    function laneOwner(cell: BoardPoint): PlayerId | null {
        for (const player of players.value) {
            if (FINAL_LANES[player.id].some(point => samePoint(point, cell))) return player.id;
        }
        return null;
    }

    function homeOwner(cell: BoardPoint): PlayerId | null {
        for (const player of players.value) {
            if (HOME_POINTS[player.id].some(point => samePoint(point, cell))) return player.id;
        }
        return null;
    }

    function isLegalPiece(playerId: PlayerId, pieceId: number): boolean {
        return phase.value === 'selecting' && currentPlayer.value === playerId && legalMoves.value.includes(pieceId);
    }

    function getMainTrackIndex(playerId: PlayerId, piece: LudoPiece): number | null {
        if (piece.step < 0 || piece.step >= TRACK_LENGTH) return null;
        return (players.value[playerId].startIndex + piece.step) % TRACK_LENGTH;
    }

    function captureAt(playerId: PlayerId, trackIndex: number) {
        const captured: string[] = [];

        for (const opponent of players.value) {
            if (opponent.id === playerId) continue;

            for (const piece of opponent.pieces) {
                if (getMainTrackIndex(opponent.id, piece) !== trackIndex) continue;
                piece.step = -1;
                captured.push(`${opponent.shortName}${piece.id + 1}`);
            }
        }

        if (captured.length > 0) {
            log(`${players.value[playerId].shortName}${lastMove.value?.piece ?? ''} 击回 ${captured.join('、')}`);
        }
    }

    function hasWon(playerId: PlayerId): boolean {
        return players.value[playerId].pieces.every(piece => piece.step >= FINISH_STEP);
    }

    function finishTurn(rolledSix: boolean) {
        if (winner.value !== null) return;

        if (rolledSix) {
            dice.value = null;
            phase.value = 'rolling';
            message.value = `${activePlayer.value.name} 获得一次连续投骰`;
            if (activePlayer.value.isAI) scheduleAITurn();
            return;
        }

        currentPlayer.value = nextPlayerId(currentPlayer.value);
        dice.value = null;
        phase.value = 'rolling';
        message.value = `轮到 ${activePlayer.value.name}`;
        if (activePlayer.value.isAI) scheduleAITurn();
    }

    function movePiece(pieceId: number) {
        if (phase.value !== 'selecting') return;
        if (!legalMoves.value.includes(pieceId) || dice.value === null) return;

        const playerId = currentPlayer.value;
        const player = players.value[playerId];
        const piece = player.pieces[pieceId];
        const rolled = dice.value;
        const fromHome = piece.step < 0;

        phase.value = 'moving';
        if (fromHome) piece.step = 0;
        else piece.step += rolled;

        lastMove.value = { player: playerId, piece: pieceId + 1 };
        log(`${player.shortName}${pieceId + 1} ${fromHome ? '起飞' : `前进 ${rolled} 格`}`);

        const trackIndex = getMainTrackIndex(playerId, piece);
        if (trackIndex !== null) captureAt(playerId, trackIndex);

        if (hasWon(playerId)) {
            winner.value = playerId;
            phase.value = 'ended';
            message.value = `${player.name} 获胜`;
            return;
        }

        aiTimer = setTimeout(() => finishTurn(rolled === 6), 360);
    }

    function chooseAIMove(): number {
        const playerId = currentPlayer.value;
        const moves = legalMoves.value;
        let bestMove = moves[0];
        let bestScore = -Infinity;

        for (const pieceId of moves) {
            const piece = players.value[playerId].pieces[pieceId];
            const fromHome = piece.step < 0;
            const nextStep = fromHome ? 0 : piece.step + (dice.value ?? 0);
            let score = nextStep;

            if (nextStep >= FINISH_STEP) score += 1000;
            if (fromHome) score += 70;
            if (nextStep >= TRACK_LENGTH) score += 120;

            if (nextStep >= 0 && nextStep < TRACK_LENGTH) {
                const trackIndex = (players.value[playerId].startIndex + nextStep) % TRACK_LENGTH;
                const canCapture = players.value.some(
                    opponent =>
                        opponent.id !== playerId &&
                        opponent.pieces.some(piece => getMainTrackIndex(opponent.id, piece) === trackIndex),
                );
                if (canCapture) score += 260;
            }

            score += Math.random() * 24;
            if (score > bestScore) {
                bestScore = score;
                bestMove = pieceId;
            }
        }

        return bestMove;
    }

    function rollDice() {
        if (phase.value !== 'rolling') return;
        const player = activePlayer.value;
        dice.value = Math.floor(Math.random() * 6) + 1;

        if (legalMoves.value.length === 0) {
            phase.value = 'moving';
            message.value = `${player.name} 投出 ${dice.value}，没有可飞的飞机`;
            log(`${player.shortName} 投出 ${dice.value}`);
            aiTimer = setTimeout(() => finishTurn(false), 700);
            return;
        }

        phase.value = 'selecting';
        message.value = `${player.name} 投出 ${dice.value}`;

        if (player.isAI) {
            aiTimer = setTimeout(() => movePiece(chooseAIMove()), 520);
        }
    }

    function scheduleAITurn() {
        clearTimers();
        aiTimer = setTimeout(() => {
            if (phase.value !== 'rolling' || !activePlayer.value.isAI) return;
            rollDice();
        }, 620);
    }

    function pieceStatus(piece: LudoPiece): 'home' | 'flying' | 'finished' {
        if (piece.step < 0) return 'home';
        if (piece.step >= FINISH_STEP) return 'finished';
        return 'flying';
    }

    function playerStats(playerId: PlayerId) {
        const pieces = players.value[playerId].pieces;
        return {
            home: pieces.filter(piece => pieceStatus(piece) === 'home').length,
            flying: pieces.filter(piece => pieceStatus(piece) === 'flying').length,
            finished: pieces.filter(piece => pieceStatus(piece) === 'finished').length,
        };
    }

    onUnmounted(() => {
        clearTimers();
    });

    return {
        players,
        currentPlayer,
        activePlayer,
        phase,
        dice,
        message,
        winner,
        lastMove,
        eventLog,
        legalMoves,
        canHumanRoll,
        canHumanMove,
        boardCells,
        startGame,
        rollDice,
        movePiece,
        clearTimers,
        getPiecesAt,
        isLegalPiece,
        isTrackCell,
        isStartCell,
        laneOwner,
        homeOwner,
        playerStats,
    };
}
