import { computed, onUnmounted, ref } from 'vue';

const CANVAS_W = 820;
const CANVAS_H = 460;
const RAIL = 42;
const BALL_R = 10;
const POCKET_R = 24;
const FRICTION = 0.988;
const STOP_SPEED = 0.035;
const MAX_POWER = 18;
const CUE_BALL_ID = 0;

type Turn = 'player' | 'ai';
type Winner = 'player' | 'ai' | null;

interface Ball {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: string;
    stripe?: string;
    label: string;
    potted: false | true | Turn;
}

interface PointerPoint {
    x: number;
    y: number;
}

interface ShotPlan {
    angle: number;
    power: number;
    target: Ball;
    pocket: PointerPoint;
    quality: number;
}

const pockets = [
    { x: RAIL, y: RAIL },
    { x: CANVAS_W / 2, y: RAIL - 2 },
    { x: CANVAS_W - RAIL, y: RAIL },
    { x: RAIL, y: CANVAS_H - RAIL },
    { x: CANVAS_W / 2, y: CANVAS_H - RAIL + 2 },
    { x: CANVAS_W - RAIL, y: CANVAS_H - RAIL },
];

const rackColors = ['#f3c447', '#2f6fee', '#df3f40', '#7a47b8', '#f2762e', '#279a63', '#8f2d3f', '#20232a', '#f3c447'];

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function distance(a: PointerPoint, b: PointerPoint) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function allBallsStopped(balls: Ball[]) {
    return balls.every(ball => ball.potted || Math.hypot(ball.vx, ball.vy) < STOP_SPEED);
}

function segmentDistance(point: PointerPoint, start: PointerPoint, end: PointerPoint) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return distance(point, start);
    const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq, 0, 1);
    return distance(point, { x: start.x + dx * t, y: start.y + dy * t });
}

function opposite(turn: Turn): Turn {
    return turn === 'player' ? 'ai' : 'player';
}

export function useBilliards() {
    const gameStatus = ref<'idle' | 'playing' | 'won'>('idle');
    const turn = ref<Turn>('player');
    const winner = ref<Winner>(null);
    const score = ref(0);
    const playerScore = ref(0);
    const aiScore = ref(0);
    const shots = ref(0);
    const aiShots = ref(0);
    const fouls = ref(0);
    const highScore = ref(Number(localStorage.getItem('billiards-high-score') || 0));
    const balls = ref<Ball[]>([]);
    const aiming = ref(false);
    const aimPoint = ref<PointerPoint | null>(null);
    const cueMessage = ref('玩家回合：拖拽白球瞄准，松手击球');

    let rafId: number | null = null;
    let aiTimer: ReturnType<typeof setTimeout> | null = null;
    let shotActor: Turn = 'player';
    let pottedThisShot = 0;
    let foulThisShot = false;
    let wasMoving = false;

    const moving = computed(() => !allBallsStopped(balls.value));
    const pottedCount = computed(() => balls.value.filter(ball => ball.id !== CUE_BALL_ID && ball.potted).length);
    const remaining = computed(() => balls.value.filter(ball => ball.id !== CUE_BALL_ID && !ball.potted).length);
    const isPlayerTurn = computed(() => turn.value === 'player');
    const isAiTurn = computed(() => turn.value === 'ai');
    const turnLabel = computed(() => (turn.value === 'player' ? '玩家' : 'AI'));

    function createRack(): Ball[] {
        const nextBalls: Ball[] = [
            {
                id: CUE_BALL_ID,
                x: RAIL + 175,
                y: CANVAS_H / 2,
                vx: 0,
                vy: 0,
                color: '#f8fafc',
                label: '',
                potted: false,
            },
        ];

        const startX = CANVAS_W - RAIL - 210;
        const startY = CANVAS_H / 2;
        const gap = BALL_R * 2 + 1.6;
        let id = 1;

        for (let row = 0; row < 4; row++) {
            for (let col = 0; col <= row; col++) {
                if (id > 9) break;
                nextBalls.push({
                    id,
                    x: startX + row * gap,
                    y: startY + (col - row / 2) * gap,
                    vx: 0,
                    vy: 0,
                    color: rackColors[id - 1],
                    stripe: id > 8 ? '#f8fafc' : undefined,
                    label: String(id),
                    potted: false,
                });
                id++;
            }
        }

        return nextBalls;
    }

    function startGame() {
        clearAiTimer();
        score.value = 0;
        playerScore.value = 0;
        aiScore.value = 0;
        shots.value = 0;
        aiShots.value = 0;
        fouls.value = 0;
        winner.value = null;
        turn.value = 'player';
        shotActor = 'player';
        pottedThisShot = 0;
        foulThisShot = false;
        wasMoving = false;
        balls.value = createRack();
        aiming.value = false;
        aimPoint.value = null;
        cueMessage.value = '玩家回合：拖拽白球瞄准，松手击球';
        gameStatus.value = 'playing';
        startLoop();
    }

    function getCueBall() {
        return balls.value.find(ball => ball.id === CUE_BALL_ID) ?? null;
    }

    function clearAiTimer() {
        if (aiTimer) {
            clearTimeout(aiTimer);
            aiTimer = null;
        }
    }

    function resetCueBall() {
        const cueBall = getCueBall();
        if (!cueBall) return;

        cueBall.x = RAIL + 175;
        cueBall.y = CANVAS_H / 2;
        cueBall.vx = 0;
        cueBall.vy = 0;
        cueBall.potted = false;

        for (let i = 0; i < 10; i++) {
            const overlap = balls.value.some(ball => {
                if (ball.id === CUE_BALL_ID || ball.potted) return false;
                return distance(cueBall, ball) < BALL_R * 2.4;
            });
            if (!overlap) break;
            cueBall.y = RAIL + 80 + i * 26;
        }
    }

    function normalizePointer(canvas: HTMLCanvasElement, event: PointerEvent): PointerPoint {
        const rect = canvas.getBoundingClientRect();
        return {
            x: ((event.clientX - rect.left) / rect.width) * CANVAS_W,
            y: ((event.clientY - rect.top) / rect.height) * CANVAS_H,
        };
    }

    function pointerDown(canvas: HTMLCanvasElement, event: PointerEvent) {
        if (gameStatus.value !== 'playing' || moving.value || turn.value !== 'player') return;

        const cueBall = getCueBall();
        if (!cueBall || cueBall.potted) return;

        const point = normalizePointer(canvas, event);
        if (distance(point, cueBall) > 86) return;

        aiming.value = true;
        aimPoint.value = point;
        canvas.setPointerCapture(event.pointerId);
    }

    function pointerMove(canvas: HTMLCanvasElement, event: PointerEvent) {
        if (!aiming.value) return;
        aimPoint.value = normalizePointer(canvas, event);
    }

    function pointerUp(canvas: HTMLCanvasElement, event: PointerEvent) {
        if (!aiming.value) return;

        const cueBall = getCueBall();
        const point = normalizePointer(canvas, event);
        aiming.value = false;
        aimPoint.value = null;
        if (canvas.hasPointerCapture(event.pointerId)) {
            canvas.releasePointerCapture(event.pointerId);
        }

        if (!cueBall || cueBall.potted) return;

        const dx = cueBall.x - point.x;
        const dy = cueBall.y - point.y;
        const pull = Math.min(120, Math.hypot(dx, dy));
        if (pull < 12) return;

        const power = (pull / 120) * MAX_POWER;
        strike(turn.value, Math.atan2(dy, dx), power);
    }

    function strike(actor: Turn, angle: number, power: number) {
        const cueBall = getCueBall();
        if (!cueBall || cueBall.potted || gameStatus.value !== 'playing') return;

        shotActor = actor;
        pottedThisShot = 0;
        foulThisShot = false;
        wasMoving = true;
        cueBall.vx = Math.cos(angle) * clamp(power, 2, MAX_POWER);
        cueBall.vy = Math.sin(angle) * clamp(power, 2, MAX_POWER);

        if (actor === 'player') {
            shots.value++;
            cueMessage.value = '球还在滚动，等待停稳';
        } else {
            aiShots.value++;
            cueMessage.value = 'AI 已出杆，等待球停稳';
        }
    }

    function updateBallMotion() {
        for (const ball of balls.value) {
            if (ball.potted) continue;

            ball.x += ball.vx;
            ball.y += ball.vy;
            ball.vx *= FRICTION;
            ball.vy *= FRICTION;

            if (Math.hypot(ball.vx, ball.vy) < STOP_SPEED) {
                ball.vx = 0;
                ball.vy = 0;
            }

            if (ball.x < RAIL + BALL_R) {
                ball.x = RAIL + BALL_R;
                ball.vx = Math.abs(ball.vx) * 0.86;
            }
            if (ball.x > CANVAS_W - RAIL - BALL_R) {
                ball.x = CANVAS_W - RAIL - BALL_R;
                ball.vx = -Math.abs(ball.vx) * 0.86;
            }
            if (ball.y < RAIL + BALL_R) {
                ball.y = RAIL + BALL_R;
                ball.vy = Math.abs(ball.vy) * 0.86;
            }
            if (ball.y > CANVAS_H - RAIL - BALL_R) {
                ball.y = CANVAS_H - RAIL - BALL_R;
                ball.vy = -Math.abs(ball.vy) * 0.86;
            }
        }
    }

    function resolveCollisions() {
        const activeBalls = balls.value.filter(ball => !ball.potted);

        for (let i = 0; i < activeBalls.length; i++) {
            for (let j = i + 1; j < activeBalls.length; j++) {
                const a = activeBalls[i];
                const b = activeBalls[j];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const minDist = BALL_R * 2;

                if (dist <= 0 || dist >= minDist) continue;

                const nx = dx / dist;
                const ny = dy / dist;
                const overlap = minDist - dist;

                a.x -= nx * overlap * 0.5;
                a.y -= ny * overlap * 0.5;
                b.x += nx * overlap * 0.5;
                b.y += ny * overlap * 0.5;

                const tx = -ny;
                const ty = nx;
                const dpTanA = a.vx * tx + a.vy * ty;
                const dpTanB = b.vx * tx + b.vy * ty;
                const dpNormA = a.vx * nx + a.vy * ny;
                const dpNormB = b.vx * nx + b.vy * ny;

                a.vx = tx * dpTanA + nx * dpNormB;
                a.vy = ty * dpTanA + ny * dpNormB;
                b.vx = tx * dpTanB + nx * dpNormA;
                b.vy = ty * dpTanB + ny * dpNormA;
            }
        }
    }

    function addScore(actor: Turn, value: number) {
        if (actor === 'player') {
            playerScore.value += value;
            score.value = playerScore.value;
            if (playerScore.value > highScore.value) {
                highScore.value = playerScore.value;
                localStorage.setItem('billiards-high-score', String(highScore.value));
            }
        } else {
            aiScore.value += value;
        }
    }

    function checkPockets() {
        for (const ball of balls.value) {
            if (ball.potted) continue;

            const pocket = pockets.find(item => distance(ball, item) < POCKET_R);
            if (!pocket) continue;

            ball.potted = ball.id === CUE_BALL_ID ? true : shotActor;
            ball.vx = 0;
            ball.vy = 0;

            if (ball.id === CUE_BALL_ID) {
                fouls.value++;
                foulThisShot = true;
                if (shotActor === 'player') {
                    playerScore.value = Math.max(0, playerScore.value - 30);
                    score.value = playerScore.value;
                } else {
                    aiScore.value = Math.max(0, aiScore.value - 30);
                }
                cueMessage.value = `${shotActor === 'player' ? '玩家' : 'AI'} 白球入袋，犯规`;
            } else {
                const value = ball.id === 9 ? 180 : 100;
                pottedThisShot++;
                addScore(shotActor, value);
                cueMessage.value = `${shotActor === 'player' ? '玩家' : 'AI'} 进球 +${value}`;
            }
        }
    }

    function finishShot() {
        const cueBall = getCueBall();
        if (cueBall?.potted) {
            resetCueBall();
        }

        if (remaining.value === 0) {
            winner.value = playerScore.value >= aiScore.value ? 'player' : 'ai';
            gameStatus.value = 'won';
            cueMessage.value = winner.value === 'player' ? '玩家获胜' : 'AI 获胜';
            stopLoop();
            return;
        }

        if (foulThisShot || pottedThisShot === 0) {
            turn.value = opposite(shotActor);
        } else {
            turn.value = shotActor;
        }

        cueMessage.value = turn.value === 'player' ? '玩家回合：拖拽白球瞄准，松手击球' : 'AI 回合：正在思考下一杆';

        if (turn.value === 'ai') {
            scheduleAiShot();
        }
    }

    function isPathClear(start: PointerPoint, end: PointerPoint, ignoreIds: number[]) {
        return balls.value.every(ball => {
            if (ball.potted || ignoreIds.includes(ball.id)) return true;
            return segmentDistance(ball, start, end) > BALL_R * 2.35;
        });
    }

    function findAiPlan(): ShotPlan | null {
        const cueBall = getCueBall();
        if (!cueBall || cueBall.potted) return null;

        let best: ShotPlan | null = null;
        const targets = balls.value.filter(ball => ball.id !== CUE_BALL_ID && !ball.potted);

        for (const target of targets) {
            for (const pocket of pockets) {
                const targetToPocket = distance(target, pocket);
                if (targetToPocket < BALL_R) continue;

                const tx = (pocket.x - target.x) / targetToPocket;
                const ty = (pocket.y - target.y) / targetToPocket;
                const ghost = {
                    x: target.x - tx * BALL_R * 2,
                    y: target.y - ty * BALL_R * 2,
                };

                if (
                    ghost.x < RAIL + BALL_R ||
                    ghost.x > CANVAS_W - RAIL - BALL_R ||
                    ghost.y < RAIL + BALL_R ||
                    ghost.y > CANVAS_H - RAIL - BALL_R
                )
                    continue;

                const cueToGhost = distance(cueBall, ghost);
                if (!isPathClear(cueBall, ghost, [CUE_BALL_ID, target.id])) continue;
                if (!isPathClear(target, pocket, [CUE_BALL_ID, target.id])) continue;

                const angle = Math.atan2(ghost.y - cueBall.y, ghost.x - cueBall.x);
                const cutAngle = Math.abs(Math.atan2(ty, tx) - angle);
                const normalizedCut = Math.abs(Math.atan2(Math.sin(cutAngle), Math.cos(cutAngle)));
                const quality = cueToGhost + targetToPocket * 0.8 + normalizedCut * 120;

                if (!best || quality < best.quality) {
                    best = {
                        angle,
                        power: clamp((cueToGhost + targetToPocket) / 55, 5.2, 15.5),
                        target,
                        pocket,
                        quality,
                    };
                }
            }
        }

        return best;
    }

    function makeSafetyShot() {
        const cueBall = getCueBall();
        const target = balls.value.find(ball => ball.id !== CUE_BALL_ID && !ball.potted);
        if (!cueBall || !target) return;

        const angle = Math.atan2(target.y - cueBall.y, target.x - cueBall.x);
        strike('ai', angle + (Math.random() - 0.5) * 0.22, clamp(distance(cueBall, target) / 80, 4.2, 9));
    }

    function scheduleAiShot() {
        clearAiTimer();
        aiTimer = setTimeout(() => {
            if (gameStatus.value !== 'playing' || turn.value !== 'ai' || moving.value) return;

            const plan = findAiPlan();
            if (plan) {
                const miss = Math.random() < 0.2;
                const angleError = miss ? (Math.random() - 0.5) * 0.18 : (Math.random() - 0.5) * 0.045;
                cueMessage.value = `AI 瞄准 ${plan.target.label} 号球`;
                strike('ai', plan.angle + angleError, plan.power * (miss ? 0.88 : 1));
            } else {
                cueMessage.value = 'AI 没有好角度，选择防守';
                makeSafetyShot();
            }
        }, 900);
    }

    function update() {
        if (gameStatus.value !== 'playing') return;

        updateBallMotion();
        resolveCollisions();
        checkPockets();

        const currentlyMoving = moving.value;
        if (wasMoving && !currentlyMoving) {
            wasMoving = false;
            finishShot();
        } else if (!currentlyMoving && turn.value === 'ai' && !aiTimer) {
            scheduleAiShot();
        }
    }

    function gameLoop() {
        update();
        if (gameStatus.value === 'playing') {
            rafId = requestAnimationFrame(gameLoop);
        }
    }

    function startLoop() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(gameLoop);
    }

    function stopLoop() {
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        clearAiTimer();
    }

    function drawTable(ctx: CanvasRenderingContext2D) {
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

        const wood = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H);
        wood.addColorStop(0, '#7a3f1d');
        wood.addColorStop(0.5, '#4d2a16');
        wood.addColorStop(1, '#8b4a22');
        ctx.fillStyle = wood;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        ctx.fillStyle = '#123c32';
        ctx.fillRect(RAIL - 10, RAIL - 10, CANVAS_W - (RAIL - 10) * 2, CANVAS_H - (RAIL - 10) * 2);

        const cloth = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, 60, CANVAS_W / 2, CANVAS_H / 2, 480);
        cloth.addColorStop(0, '#1f8a68');
        cloth.addColorStop(1, '#0f5c4c');
        ctx.fillStyle = cloth;
        ctx.fillRect(RAIL, RAIL, CANVAS_W - RAIL * 2, CANVAS_H - RAIL * 2);

        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(RAIL + 170, RAIL);
        ctx.lineTo(RAIL + 170, CANVAS_H - RAIL);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(RAIL + 170, CANVAS_H / 2, 86, Math.PI / 2, -Math.PI / 2, true);
        ctx.stroke();

        for (const pocket of pockets) {
            const glow = ctx.createRadialGradient(pocket.x, pocket.y, 4, pocket.x, pocket.y, POCKET_R + 8);
            glow.addColorStop(0, '#020617');
            glow.addColorStop(0.65, '#030712');
            glow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(pocket.x, pocket.y, POCKET_R + 8, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawBall(ctx: CanvasRenderingContext2D, ball: Ball) {
        if (ball.potted) return;

        ctx.save();
        ctx.translate(ball.x, ball.y);

        ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 5;
        ctx.beginPath();
        ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fill();

        ctx.shadowColor = 'transparent';
        const shine = ctx.createRadialGradient(-4, -5, 1, 0, 0, BALL_R);
        shine.addColorStop(0, '#ffffff');
        shine.addColorStop(0.18, ball.id === CUE_BALL_ID ? '#ffffff' : '#f8fafc');
        shine.addColorStop(1, ball.color);

        ctx.beginPath();
        ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
        ctx.fillStyle = shine;
        ctx.fill();
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.32)';
        ctx.lineWidth = 1;
        ctx.stroke();

        if (ball.stripe) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(0, 0, BALL_R - 1, 0, Math.PI * 2);
            ctx.clip();
            ctx.fillStyle = ball.stripe;
            ctx.fillRect(-BALL_R, -4, BALL_R * 2, 8);
            ctx.restore();
        }

        if (ball.label) {
            ctx.beginPath();
            ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = '#f8fafc';
            ctx.fill();
            ctx.fillStyle = '#111827';
            ctx.font = 'bold 7px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ball.label, 0, 0.4);
        }

        ctx.restore();
    }

    function drawAim(ctx: CanvasRenderingContext2D) {
        if (!aiming.value || !aimPoint.value || turn.value !== 'player') return;

        const cueBall = getCueBall();
        if (!cueBall || cueBall.potted) return;

        const dx = cueBall.x - aimPoint.value.x;
        const dy = cueBall.y - aimPoint.value.y;
        const pull = clamp(Math.hypot(dx, dy), 0, 120);
        const angle = Math.atan2(dy, dx);
        const lineLength = 95 + pull * 0.9;

        ctx.save();
        ctx.strokeStyle = 'rgba(248, 250, 252, 0.72)';
        ctx.lineWidth = 2;
        ctx.setLineDash([9, 8]);
        ctx.beginPath();
        ctx.moveTo(cueBall.x, cueBall.y);
        ctx.lineTo(cueBall.x + Math.cos(angle) * lineLength, cueBall.y + Math.sin(angle) * lineLength);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = '#d6a15b';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(
            cueBall.x - Math.cos(angle) * (BALL_R + 10 + pull * 0.35),
            cueBall.y - Math.sin(angle) * (BALL_R + 10 + pull * 0.35),
        );
        ctx.lineTo(
            cueBall.x - Math.cos(angle) * (175 + pull * 0.35),
            cueBall.y - Math.sin(angle) * (175 + pull * 0.35),
        );
        ctx.stroke();

        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(RAIL, CANVAS_H - 20, (CANVAS_W - RAIL * 2) * (pull / 120), 6);
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.strokeRect(RAIL, CANVAS_H - 20, CANVAS_W - RAIL * 2, 6);
        ctx.restore();
    }

    function drawHud(ctx: CanvasRenderingContext2D) {
        ctx.save();
        ctx.fillStyle = turn.value === 'player' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(96, 165, 250, 0.2)';
        ctx.fillRect(RAIL + 12, 14, 360, 24);
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(cueMessage.value, RAIL + 24, 26);

        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255,255,255,0.72)';
        ctx.fillText(
            `剩余 ${remaining.value} | 玩家 ${playerScore.value} : ${aiScore.value} AI`,
            CANVAS_W - RAIL - 18,
            26,
        );
        ctx.restore();
    }

    function draw(ctx: CanvasRenderingContext2D) {
        drawTable(ctx);
        for (const ball of balls.value) {
            drawBall(ctx, ball);
        }
        drawAim(ctx);
        drawHud(ctx);
    }

    onUnmounted(() => {
        stopLoop();
    });

    return {
        gameStatus,
        turn,
        turnLabel,
        winner,
        score,
        playerScore,
        aiScore,
        shots,
        aiShots,
        fouls,
        highScore,
        moving,
        isPlayerTurn,
        isAiTurn,
        pottedCount,
        remaining,
        width: CANVAS_W,
        height: CANVAS_H,
        startGame,
        pointerDown,
        pointerMove,
        pointerUp,
        draw,
    };
}
