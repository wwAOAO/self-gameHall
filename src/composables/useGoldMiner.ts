import { ref, onUnmounted } from 'vue';

const CANVAS_W = 600;
const CANVAS_H = 650;
const GROUND_Y = 120;
const ANCHOR_X = CANVAS_W / 2;
const ANCHOR_Y = 78;
const HOOK_HEAD_LENGTH = 30;
const MAX_ANGLE = 1.18;
const SWING_SPEED = 0.026;
const EXTEND_SPEED = 7.2;
const EMPTY_RETRACT_SPEED = 8.5;
const BASE_ROUND_TIME = 60;
const ITEM_PADDING = 12;

type GameStatus = 'idle' | 'playing' | 'won' | 'lost';
type ItemType = 'gold_s' | 'gold_m' | 'gold_l' | 'diamond' | 'rock';

interface ItemDefinition {
    value: number;
    size: number;
    weight: number;
    pullSpeed: number;
}

interface Item {
    id: number;
    x: number;
    y: number;
    type: ItemType;
    value: number;
    size: number;
    grabbed: boolean;
}

interface Point {
    x: number;
    y: number;
}

interface BackgroundDecoration extends Point {
    size: number;
    alpha: number;
}

const ITEM_DEFS: Record<ItemType, ItemDefinition> = {
    gold_s: { value: 50, size: 12, weight: 0.31, pullSpeed: 4.8 },
    gold_m: { value: 150, size: 19, weight: 0.23, pullSpeed: 3.5 },
    gold_l: { value: 300, size: 29, weight: 0.11, pullSpeed: 2.35 },
    diamond: { value: 500, size: 13, weight: 0.08, pullSpeed: 5.2 },
    rock: { value: 20, size: 23, weight: 0.27, pullSpeed: 2.15 },
};

function targetForLevel(level: number): number {
    return 300 + (level - 1) * 280 + Math.max(0, level - 3) * 90;
}

function chooseItemType(level: number): ItemType {
    const diamondBonus = Math.min(0.04, level * 0.006);
    const rockPenalty = Math.min(0.05, level * 0.004);
    const weightedEntries: Array<[ItemType, number]> = [
        ['gold_s', ITEM_DEFS.gold_s.weight],
        ['gold_m', ITEM_DEFS.gold_m.weight + Math.min(0.05, level * 0.004)],
        ['gold_l', ITEM_DEFS.gold_l.weight + Math.min(0.06, level * 0.006)],
        ['diamond', ITEM_DEFS.diamond.weight + diamondBonus],
        ['rock', Math.max(0.18, ITEM_DEFS.rock.weight - rockPenalty)],
    ];
    const total = weightedEntries.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = Math.random() * total;

    for (const [type, weight] of weightedEntries) {
        roll -= weight;
        if (roll <= 0) return type;
    }

    return 'gold_s';
}

function distance(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
    const vx = end.x - start.x;
    const vy = end.y - start.y;
    const wx = point.x - start.x;
    const wy = point.y - start.y;
    const lengthSq = vx * vx + vy * vy;

    if (lengthSq === 0) return distance(point, start);

    const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / lengthSq));
    const projection = {
        x: start.x + vx * t,
        y: start.y + vy * t,
    };

    return distance(point, projection);
}

function getHookTip(angle: number, ropeLength: number): Point {
    const fullLength = HOOK_HEAD_LENGTH + ropeLength;

    return {
        x: ANCHOR_X + Math.sin(angle) * fullLength,
        y: ANCHOR_Y + Math.cos(angle) * fullLength,
    };
}

function getBoundaryLimitedLength(angle: number): number {
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const candidates: number[] = [];

    if (cos > 0.001) {
        candidates.push((CANVAS_H - 12 - ANCHOR_Y) / cos);
    }

    if (sin > 0.001) {
        candidates.push((CANVAS_W - 12 - ANCHOR_X) / sin);
    } else if (sin < -0.001) {
        candidates.push((12 - ANCHOR_X) / sin);
    }

    return Math.max(0, Math.min(...candidates) - HOOK_HEAD_LENGTH);
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const radius = Math.min(r, w / 2, h / 2);

    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

export function useGoldMiner() {
    const gameStatus = ref<GameStatus>('idle');
    const score = ref(0);
    const targetScore = ref(targetForLevel(1));
    const timeLeft = ref(BASE_ROUND_TIME);
    const level = ref(1);
    const highScore = ref(Number(localStorage.getItem('goldminer-high-score') || 0));

    const hookAngle = ref(0);
    const hookSwingDir = ref(1);
    const hookLength = ref(0);
    const hookX = ref(ANCHOR_X);
    const hookY = ref(ANCHOR_Y + HOOK_HEAD_LENGTH);
    const isExtending = ref(false);
    const isRetracting = ref(false);
    const grabbedItem = ref<Item | null>(null);
    const items = ref<Item[]>([]);

    let rafId: number | null = null;
    let timerInterval: ReturnType<typeof setInterval> | null = null;
    let nextItemId = 1;
    let bgDecorations: BackgroundDecoration[] = [];

    function updateHookTip() {
        const tip = getHookTip(hookAngle.value, hookLength.value);
        hookX.value = tip.x;
        hookY.value = tip.y;
    }

    function createItem(type: ItemType, x: number, y: number): Item {
        const definition = ITEM_DEFS[type];

        return {
            id: nextItemId++,
            x,
            y,
            type,
            value: definition.value,
            size: definition.size,
            grabbed: false,
        };
    }

    function canPlaceItem(candidate: Item, placed: Item[]): boolean {
        return placed.every(item => distance(candidate, item) > item.size + candidate.size + ITEM_PADDING);
    }

    function generateItems() {
        const newItems: Item[] = [];
        const maxItems = Math.min(22, 10 + level.value * 2);
        const minY = GROUND_Y + 48;
        const maxY = CANVAS_H - 42;
        let attempts = 0;

        while (newItems.length < maxItems && attempts < maxItems * 80) {
            attempts++;
            const type = chooseItemType(level.value);
            const definition = ITEM_DEFS[type];
            const candidate = createItem(
                type,
                34 + definition.size + Math.random() * (CANVAS_W - 68 - definition.size * 2),
                minY + Math.random() * (maxY - minY),
            );

            if (canPlaceItem(candidate, newItems)) {
                newItems.push(candidate);
            }
        }

        ensureReachableValue(newItems);
        items.value = newItems;

        bgDecorations = Array.from({ length: 38 }, () => ({
            x: Math.random() * CANVAS_W,
            y: GROUND_Y + 18 + Math.random() * (CANVAS_H - GROUND_Y - 36),
            size: 0.8 + Math.random() * 2.2,
            alpha: 0.12 + Math.random() * 0.22,
        }));
    }

    function ensureReachableValue(generatedItems: Item[]) {
        let currentValue = generatedItems.reduce((sum, item) => sum + item.value, 0);
        const desiredValue = Math.ceil(targetScore.value * 1.35);
        const reserveSpots = [
            { x: CANVAS_W * 0.38, y: GROUND_Y + 135 },
            { x: CANVAS_W * 0.62, y: GROUND_Y + 160 },
            { x: CANVAS_W * 0.5, y: GROUND_Y + 250 },
        ];

        for (const spot of reserveSpots) {
            if (currentValue >= desiredValue) break;

            const type: ItemType = currentValue + ITEM_DEFS.gold_l.value < desiredValue ? 'gold_l' : 'gold_m';
            const item = createItem(type, spot.x, spot.y);

            if (canPlaceItem(item, generatedItems)) {
                generatedItems.push(item);
                currentValue += item.value;
            }
        }
    }

    function resetHook() {
        hookLength.value = 0;
        hookAngle.value = 0;
        hookSwingDir.value = 1;
        isExtending.value = false;
        isRetracting.value = false;
        grabbedItem.value = null;
        updateHookTip();
    }

    function startGame() {
        const shouldAdvanceLevel = gameStatus.value === 'won';

        if (shouldAdvanceLevel) {
            level.value++;
        } else {
            level.value = 1;
            score.value = 0;
        }

        targetScore.value = targetForLevel(level.value);
        timeLeft.value = Math.max(35, BASE_ROUND_TIME - Math.floor((level.value - 1) / 3) * 3);
        resetHook();
        generateItems();
        gameStatus.value = 'playing';
        startLoop();
        startTimer();
    }

    function restartGame() {
        gameStatus.value = 'idle';
        startGame();
    }

    function startTimer() {
        if (timerInterval) clearInterval(timerInterval);

        timerInterval = setInterval(() => {
            if (gameStatus.value !== 'playing') return;

            timeLeft.value--;

            if (timeLeft.value <= 0) {
                finishRound();
            }
        }, 1000);
    }

    function finishRound() {
        gameStatus.value = score.value >= targetScore.value ? 'won' : 'lost';
        isExtending.value = false;
        isRetracting.value = false;
        grabbedItem.value = null;
        stopLoop();

        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    function dropHook() {
        if (gameStatus.value !== 'playing') return;
        if (isExtending.value || isRetracting.value) return;
        isExtending.value = true;
    }

    function findHit(start: Point, end: Point): Item | null {
        let closestItem: Item | null = null;
        let closestDistance = Number.POSITIVE_INFINITY;

        for (const item of items.value) {
            if (item.grabbed) continue;

            const hitRadius = item.size + 7;
            const segmentDistance = distanceToSegment(item, start, end);

            if (segmentDistance <= hitRadius) {
                const itemDistance = distance({ x: ANCHOR_X, y: ANCHOR_Y }, item);

                if (itemDistance < closestDistance) {
                    closestDistance = itemDistance;
                    closestItem = item;
                }
            }
        }

        return closestItem;
    }

    function collectGrabbedItem() {
        if (!grabbedItem.value) return;

        score.value += grabbedItem.value.value;

        if (score.value > highScore.value) {
            highScore.value = score.value;
            localStorage.setItem('goldminer-high-score', String(highScore.value));
        }

        items.value = items.value.filter(item => item.id !== grabbedItem.value?.id);
        grabbedItem.value = null;
    }

    function update() {
        if (gameStatus.value !== 'playing') return;

        if (!isExtending.value && !isRetracting.value) {
            hookAngle.value += SWING_SPEED * hookSwingDir.value;

            if (hookAngle.value > MAX_ANGLE) {
                hookAngle.value = MAX_ANGLE;
                hookSwingDir.value = -1;
            } else if (hookAngle.value < -MAX_ANGLE) {
                hookAngle.value = -MAX_ANGLE;
                hookSwingDir.value = 1;
            }

            updateHookTip();
            return;
        }

        if (isExtending.value) {
            const previousTip = getHookTip(hookAngle.value, hookLength.value);
            const maxLength = getBoundaryLimitedLength(hookAngle.value);
            hookLength.value = Math.min(maxLength, hookLength.value + EXTEND_SPEED);
            updateHookTip();

            const hit = findHit(previousTip, { x: hookX.value, y: hookY.value });

            if (hit) {
                hit.grabbed = true;
                grabbedItem.value = hit;
                isExtending.value = false;
                isRetracting.value = true;
                return;
            }

            if (hookLength.value >= maxLength) {
                isExtending.value = false;
                isRetracting.value = true;
            }
        }

        if (isRetracting.value) {
            const retractSpeed = grabbedItem.value ? ITEM_DEFS[grabbedItem.value.type].pullSpeed : EMPTY_RETRACT_SPEED;

            hookLength.value = Math.max(0, hookLength.value - retractSpeed);
            updateHookTip();

            if (hookLength.value <= 0) {
                hookLength.value = 0;
                isRetracting.value = false;
                updateHookTip();
                collectGrabbedItem();
            }
        }
    }

    function gameLoop() {
        if (gameStatus.value === 'playing') {
            update();
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
    }

    function drawMine(ctx: CanvasRenderingContext2D) {
        const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
        sky.addColorStop(0, '#111624');
        sky.addColorStop(0.2, '#1b2634');
        sky.addColorStop(0.28, '#5f3a24');
        sky.addColorStop(1, '#1c100b');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        const light = ctx.createRadialGradient(ANCHOR_X, 72, 30, ANCHOR_X, 140, 360);
        light.addColorStop(0, 'rgba(255, 216, 124, 0.28)');
        light.addColorStop(0.38, 'rgba(255, 177, 69, 0.1)');
        light.addColorStop(1, 'rgba(255, 177, 69, 0)');
        ctx.fillStyle = light;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        ctx.fillStyle = 'rgba(255, 210, 120, 0.06)';
        ctx.beginPath();
        ctx.moveTo(ANCHOR_X - 55, 92);
        ctx.lineTo(ANCHOR_X + 55, 92);
        ctx.lineTo(CANVAS_W - 42, CANVAS_H);
        ctx.lineTo(42, CANVAS_H);
        ctx.closePath();
        ctx.fill();

        const groundGrad = ctx.createLinearGradient(0, GROUND_Y, 0, GROUND_Y + 34);
        groundGrad.addColorStop(0, '#8c5b35');
        groundGrad.addColorStop(0.48, '#5f3922');
        groundGrad.addColorStop(1, '#2d1a10');
        ctx.fillStyle = groundGrad;
        ctx.fillRect(0, GROUND_Y, CANVAS_W, 22);

        ctx.strokeStyle = 'rgba(33, 17, 9, 0.5)';
        ctx.lineWidth = 2;
        for (let x = -40; x < CANVAS_W; x += 70) {
            ctx.beginPath();
            ctx.moveTo(x, GROUND_Y + 18);
            ctx.lineTo(x + 36, CANVAS_H);
            ctx.stroke();
        }

        drawTimber(ctx, 38, 28, 28, 104);
        drawTimber(ctx, CANVAS_W - 66, 28, 28, 104);
        drawTimber(ctx, 72, 34, CANVAS_W - 144, 26);
    }

    function drawTimber(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
        const timber = ctx.createLinearGradient(x, y, x + w, y + h);
        timber.addColorStop(0, '#8b542d');
        timber.addColorStop(0.45, '#5f341d');
        timber.addColorStop(1, '#2f170d');
        roundedRect(ctx, x, y, w, h, 7);
        ctx.fillStyle = timber;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 215, 140, 0.16)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.strokeStyle = 'rgba(42, 19, 9, 0.42)';
        ctx.lineWidth = 1;
        for (let i = 8; i < (w > h ? w : h); i += 18) {
            ctx.beginPath();
            if (w > h) {
                ctx.moveTo(x + i, y + 4);
                ctx.lineTo(x + i - 16, y + h - 5);
            } else {
                ctx.moveTo(x + 5, y + i);
                ctx.lineTo(x + w - 5, y + i - 12);
            }
            ctx.stroke();
        }
    }

    function drawMinerRig(ctx: CanvasRenderingContext2D) {
        ctx.save();
        ctx.translate(ANCHOR_X, ANCHOR_Y);

        const pulley = ctx.createRadialGradient(0, 0, 4, 0, 0, 22);
        pulley.addColorStop(0, '#fff0b1');
        pulley.addColorStop(0.45, '#c78732');
        pulley.addColorStop(1, '#4e2d16');
        ctx.beginPath();
        ctx.arc(0, 0, 23, 0, Math.PI * 2);
        ctx.fillStyle = pulley;
        ctx.fill();
        ctx.strokeStyle = '#2a170d';
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#2c1a10';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 230, 170, 0.42)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();
    }

    function drawGold(ctx: CanvasRenderingContext2D, item: Item, scale = 1) {
        const radius = item.size * scale;
        ctx.save();
        ctx.shadowColor = 'rgba(255, 189, 57, 0.42)';
        ctx.shadowBlur = 12 * scale;

        const gradient = ctx.createRadialGradient(
            item.x - radius * 0.35,
            item.y - radius * 0.45,
            2,
            item.x,
            item.y,
            radius * 1.2,
        );
        gradient.addColorStop(0, '#fff8b8');
        gradient.addColorStop(0.42, item.type === 'gold_l' ? '#ffb93b' : '#ffd84f');
        gradient.addColorStop(1, '#a85e06');

        ctx.beginPath();
        ctx.ellipse(item.x, item.y, radius * 1.18, radius * 0.86, -0.18, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#6e3f05';
        ctx.lineWidth = Math.max(1, 2 * scale);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 255, 230, 0.55)';
        ctx.beginPath();
        ctx.ellipse(item.x - radius * 0.36, item.y - radius * 0.32, radius * 0.28, radius * 0.14, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawDiamond(ctx: CanvasRenderingContext2D, item: Item, scale = 1) {
        const size = item.size * scale;
        ctx.save();
        ctx.shadowColor = 'rgba(79, 226, 255, 0.5)';
        ctx.shadowBlur = 14 * scale;

        ctx.beginPath();
        ctx.moveTo(item.x, item.y - size * 1.08);
        ctx.lineTo(item.x + size * 0.9, item.y - size * 0.08);
        ctx.lineTo(item.x, item.y + size * 1.06);
        ctx.lineTo(item.x - size * 0.9, item.y - size * 0.08);
        ctx.closePath();
        const gradient = ctx.createLinearGradient(item.x - size, item.y - size, item.x + size, item.y + size);
        gradient.addColorStop(0, '#dffbff');
        gradient.addColorStop(0.42, '#5ce4ff');
        gradient.addColorStop(1, '#0b88a5');
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#075f76';
        ctx.lineWidth = Math.max(1, 1.6 * scale);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255,255,255,0.48)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(item.x - size * 0.48, item.y - size * 0.08);
        ctx.lineTo(item.x, item.y + size * 1.02);
        ctx.lineTo(item.x + size * 0.48, item.y - size * 0.08);
        ctx.stroke();
        ctx.restore();
    }

    function drawRock(ctx: CanvasRenderingContext2D, item: Item, scale = 1) {
        const size = item.size * scale;
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.36)';
        ctx.shadowBlur = 8 * scale;
        ctx.beginPath();
        ctx.moveTo(item.x - size, item.y + size * 0.3);
        ctx.lineTo(item.x - size * 0.62, item.y - size * 0.88);
        ctx.lineTo(item.x + size * 0.24, item.y - size * 0.76);
        ctx.lineTo(item.x + size, item.y + size * 0.05);
        ctx.lineTo(item.x + size * 0.48, item.y + size);
        ctx.closePath();
        const gradient = ctx.createLinearGradient(item.x - size, item.y - size, item.x + size, item.y + size);
        gradient.addColorStop(0, '#a2a09a');
        gradient.addColorStop(0.52, '#6d6961');
        gradient.addColorStop(1, '#3f3a35');
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#2f2b28';
        ctx.lineWidth = Math.max(1, 1.5 * scale);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.beginPath();
        ctx.moveTo(item.x - size * 0.5, item.y - size * 0.35);
        ctx.lineTo(item.x + size * 0.15, item.y - size * 0.2);
        ctx.stroke();
        ctx.restore();
    }

    function drawItem(ctx: CanvasRenderingContext2D, item: Item, scale = 1) {
        if (item.type === 'diamond') {
            drawDiamond(ctx, item, scale);
        } else if (item.type === 'rock') {
            drawRock(ctx, item, scale);
        } else {
            drawGold(ctx, item, scale);
        }
    }

    function drawHook(ctx: CanvasRenderingContext2D) {
        const ropeGradient = ctx.createLinearGradient(ANCHOR_X, ANCHOR_Y, hookX.value, hookY.value);
        ropeGradient.addColorStop(0, '#d2a45b');
        ropeGradient.addColorStop(1, '#6e5531');
        ctx.strokeStyle = ropeGradient;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ANCHOR_X, ANCHOR_Y);
        ctx.lineTo(hookX.value, hookY.value);
        ctx.stroke();

        const angle = hookAngle.value;
        ctx.save();
        ctx.translate(hookX.value, hookY.value);
        ctx.rotate(-angle * 0.28);

        ctx.strokeStyle = '#d7d2c5';
        ctx.fillStyle = '#8e8a80';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.quadraticCurveTo(-18, 13, -6, 19);
        ctx.moveTo(10, 0);
        ctx.quadraticCurveTo(18, 13, 6, 19);
        ctx.stroke();

        ctx.restore();
    }

    function drawHud(ctx: CanvasRenderingContext2D) {
        roundedRect(ctx, 14, 14, 206, 70, 10);
        ctx.fillStyle = 'rgba(20, 13, 10, 0.58)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 221, 154, 0.18)';
        ctx.lineWidth = 1;
        ctx.stroke();

        roundedRect(ctx, CANVAS_W - 220, 14, 206, 70, 10);
        ctx.fillStyle = 'rgba(20, 13, 10, 0.58)';
        ctx.fill();
        ctx.stroke();

        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillStyle = '#ffd45e';
        ctx.fillText(`分数 ${score.value}`, 30, 40);
        ctx.fillStyle = '#e8d5b5';
        ctx.fillText(`目标 ${targetScore.value}`, 30, 64);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#86d7ff';
        ctx.fillText(`时间 ${timeLeft.value}s`, CANVAS_W - 30, 40);
        ctx.fillStyle = '#e8d5b5';
        ctx.fillText(`第 ${level.value} 关`, CANVAS_W - 30, 64);

        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255, 239, 200, 0.76)';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('点击矿洞放下钩子', CANVAS_W / 2, 26);
    }

    function drawVignette(ctx: CanvasRenderingContext2D) {
        const vignette = ctx.createRadialGradient(
            CANVAS_W / 2,
            CANVAS_H * 0.48,
            140,
            CANVAS_W / 2,
            CANVAS_H * 0.5,
            CANVAS_W * 0.72,
        );
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(0.62, 'rgba(0,0,0,0.14)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.6)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    function draw(ctx: CanvasRenderingContext2D) {
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        drawMine(ctx);

        for (const dec of bgDecorations) {
            ctx.fillStyle = `rgba(196, 143, 90, ${dec.alpha})`;
            ctx.beginPath();
            ctx.arc(dec.x, dec.y, dec.size, 0, Math.PI * 2);
            ctx.fill();
        }

        for (const item of items.value) {
            if (!item.grabbed) drawItem(ctx, item);
        }

        drawHook(ctx);
        drawMinerRig(ctx);

        if (grabbedItem.value) {
            drawItem(
                ctx,
                {
                    ...grabbedItem.value,
                    x: hookX.value,
                    y: hookY.value + grabbedItem.value.size * 0.72 + 10,
                },
                0.72,
            );
        }

        drawVignette(ctx);
        drawHud(ctx);
    }

    const width = CANVAS_W;
    const height = CANVAS_H;

    resetHook();

    onUnmounted(() => {
        stopLoop();
        if (timerInterval) clearInterval(timerInterval);
    });

    return {
        gameStatus,
        score,
        targetScore,
        timeLeft,
        level,
        highScore,
        width,
        height,
        startGame,
        restartGame,
        dropHook,
        update,
        draw,
    };
}
