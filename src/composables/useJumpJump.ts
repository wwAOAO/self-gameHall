import { ref } from 'vue';

const CANVAS_W = 500;
const CANVAS_H = 600;
const BLOCK_SIZE = 60;
const BLOCK_HEIGHT = 36;
const PAWN_HEIGHT = 28;
const PAWN_RADIUS = 11;
const MAX_POWER = 100;
const CHARGE_SPEED = 90;
const MAX_JUMP_DIST = 180;
const MIN_JUMP_DIST = 30;
const JUMP_DURATION = 0.5;
const DROP_DURATION = 0.8;
const CAMERA_LERP = 0.08;
const LANDING_TOLERANCE = 5;
const PERFECT_RADIUS = 9;

const BLOCK_COLORS = [
    '#FF6B6B',
    '#4ECDC4',
    '#45B7D1',
    '#96CEB4',
    '#FFEAA7',
    '#DDA0DD',
    '#F7DC6F',
    '#BB8FCE',
    '#85C1E9',
    '#F0B27A',
    '#82E0AA',
    '#F1948A',
    '#73C6B6',
    '#E8A87C',
    '#C39BD3',
];

interface Block {
    x: number;
    z: number;
    size: number;
    height: number;
    color: string;
}

let nextBlockId = 0;

function randomColor(): string {
    return BLOCK_COLORS[nextBlockId % BLOCK_COLORS.length];
}

function createBlock(x: number, z: number, size: number): Block {
    nextBlockId++;
    return { x, z, size, height: BLOCK_HEIGHT, color: randomColor() };
}

function randomDirDist(score: number): { dx: number; dz: number; dist: number } {
    const angle = Math.random() * Math.PI * 0.5 - Math.PI * 0.25;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const difficulty = Math.min(score, 24);
    const minDist = BLOCK_SIZE * 1.05 + difficulty * 1.4;
    const maxDist = BLOCK_SIZE * 2.05 + difficulty * 1.1;
    const dist = minDist + Math.random() * (maxDist - minDist);
    return { dx, dz, dist };
}

function isPointOnBlock(px: number, pz: number, block: Block): boolean {
    const half = block.size / 2 + LANDING_TOLERANCE;
    return px >= block.x - half && px <= block.x + half && pz >= block.z - half && pz <= block.z + half;
}

export function useJumpJump() {
    const gameStatus = ref<'idle' | 'playing' | 'jumping' | 'dead'>('idle');
    const score = ref(0);
    const bestScore = ref(Number(localStorage.getItem('jumpbest') || 0));

    let currentBlock: Block;
    let nextBlock: Block;
    let power = 0;
    let isCharging = false;
    let pawnX = 0;
    let pawnZ = 0;
    let pawnY = 0;
    let pawnScale = 1;
    let jumpStartX = 0;
    let jumpStartZ = 0;
    let jumpTargetX = 0;
    let jumpTargetZ = 0;
    let jumpElapsed = 0;
    let isFalling = false;
    let fallElapsed = 0;
    let cameraX = 0;
    let cameraZ = 0;
    let feedbackText = '';
    let feedbackElapsed = 0;

    let lastTime = 0;
    let rafId: number | null = null;
    let canvasCtx: CanvasRenderingContext2D | null = null;
    let offscreen: HTMLCanvasElement | null = null;
    let offCtx: CanvasRenderingContext2D | null = null;

    function initOffscreen() {
        offscreen = document.createElement('canvas');
        offscreen.width = CANVAS_W;
        offscreen.height = CANVAS_H;
        offCtx = offscreen.getContext('2d')!;
    }

    function project(wx: number, wz: number, wy = 0): { x: number; y: number } {
        const rx = wx - cameraX;
        const rz = wz - cameraZ;
        return {
            x: CANVAS_W / 2 + (rx - rz) * 0.7,
            y: CANVAS_H / 2 + (rx + rz) * 0.4 - wy * 0.85,
        };
    }

    function generateNextBlock() {
        const { dx, dz, dist } = randomDirDist(score.value);
        const nx = currentBlock.x + dx * dist;
        const nz = currentBlock.z + dz * dist;
        const difficulty = Math.min(score.value, 24);
        const size = Math.max(48, BLOCK_SIZE - Math.floor(difficulty / 6) * 2);
        nextBlock = createBlock(nx, nz, size);
    }

    function distanceToNextCenter(): number {
        const dx = nextBlock.x - pawnX;
        const dz = nextBlock.z - pawnZ;
        return Math.sqrt(dx * dx + dz * dz);
    }

    function chargeRatioToDistance(ratio: number): number {
        const eased = Math.pow(Math.max(0, Math.min(1, ratio)), 1.06);
        return MIN_JUMP_DIST + eased * (MAX_JUMP_DIST - MIN_JUMP_DIST);
    }

    function resetGame() {
        nextBlockId = 0;
        power = 0;
        isCharging = false;
        pawnScale = 1;
        isFalling = false;
        fallElapsed = 0;
        jumpElapsed = 0;
        feedbackText = '';
        feedbackElapsed = 0;
        score.value = 0;

        currentBlock = createBlock(0, 0, BLOCK_SIZE);
        pawnX = currentBlock.x;
        pawnZ = currentBlock.z;
        pawnY = 0;

        generateNextBlock();

        cameraX = (currentBlock.x + nextBlock.x) / 2;
        cameraZ = (currentBlock.z + nextBlock.z) / 2;
        lastTime = 0;
    }

    function startGame() {
        resetGame();
        gameStatus.value = 'playing';
        lastTime = performance.now();
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(gameLoop);
    }

    function startCharge() {
        if (gameStatus.value === 'playing' && !isCharging) {
            isCharging = true;
            power = 0;
            feedbackText = '';
        }
    }

    function releaseJump() {
        if (gameStatus.value !== 'playing' || !isCharging) return;
        isCharging = false;

        const dx = nextBlock.x - pawnX;
        const dz = nextBlock.z - pawnZ;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 0.001) return;

        const ndx = dx / len;
        const ndz = dz / len;
        const jumpDist = chargeRatioToDistance(power / MAX_POWER);

        jumpStartX = pawnX;
        jumpStartZ = pawnZ;
        jumpTargetX = pawnX + ndx * jumpDist;
        jumpTargetZ = pawnZ + ndz * jumpDist;
        jumpElapsed = 0;
        pawnScale = 1;
        gameStatus.value = 'jumping';
    }

    function handleJumpLand() {
        const landed = isPointOnBlock(jumpTargetX, jumpTargetZ, nextBlock);
        const centerError = Math.hypot(jumpTargetX - nextBlock.x, jumpTargetZ - nextBlock.z);

        pawnX = jumpTargetX;
        pawnZ = jumpTargetZ;
        pawnY = 0;

        if (landed) {
            const perfect = centerError <= PERFECT_RADIUS;
            score.value += perfect ? 2 : 1;
            feedbackText = perfect ? '+2 Perfect' : '+1';
            feedbackElapsed = 0;
            currentBlock = { ...nextBlock };
            generateNextBlock();
            updateBest();
            gameStatus.value = 'playing';
        } else {
            isFalling = true;
            fallElapsed = 0;
            pawnScale = 1;
            feedbackText = centerError < nextBlock.size ? '差一点' : '';
            feedbackElapsed = 0;
            gameStatus.value = 'dead';
            updateBest();
        }
    }

    function updateBest() {
        if (score.value > bestScore.value) {
            bestScore.value = score.value;
            localStorage.setItem('jumpbest', String(bestScore.value));
        }
    }

    function update(dt: number) {
        if (gameStatus.value === 'playing') {
            if (isCharging) {
                power = Math.min(power + CHARGE_SPEED * dt, MAX_POWER);
                pawnScale = 1 - (power / MAX_POWER) * 0.16;
            } else {
                pawnScale += (1 - pawnScale) * 0.25;
            }
        }

        if (gameStatus.value === 'jumping') {
            jumpElapsed += dt;
            const t = Math.min(jumpElapsed / JUMP_DURATION, 1);
            const eased = 1 - Math.pow(1 - t, 2);

            pawnX = jumpStartX + (jumpTargetX - jumpStartX) * eased;
            pawnZ = jumpStartZ + (jumpTargetZ - jumpStartZ) * eased;
            pawnY = 120 * Math.sin(t * Math.PI);

            if (t >= 1) {
                handleJumpLand();
            }
        }

        if (gameStatus.value === 'dead' && isFalling) {
            fallElapsed += dt;
            const t = Math.min(fallElapsed / DROP_DURATION, 1);
            pawnScale = 1 - t * t;
            pawnY = -30 * t;

            if (t >= 1) {
                isFalling = false;
            }
        }

        if (feedbackText) {
            feedbackElapsed += dt;
            if (feedbackElapsed > 1.1) feedbackText = '';
        }

        const targetCamX = (currentBlock.x + nextBlock.x) / 2;
        const targetCamZ = (currentBlock.z + nextBlock.z) / 2;
        cameraX += (targetCamX - cameraX) * CAMERA_LERP;
        cameraZ += (targetCamZ - cameraZ) * CAMERA_LERP;
    }

    function render() {
        if (!offCtx) return;
        if (!currentBlock || !nextBlock) return;
        const c = offCtx;
        c.clearRect(0, 0, CANVAS_W, CANVAS_H);

        const bg = c.createLinearGradient(0, 0, 0, CANVAS_H);
        bg.addColorStop(0, '#1a1a2e');
        bg.addColorStop(0.5, '#16213e');
        bg.addColorStop(1, '#0f3460');
        c.fillStyle = bg;
        c.fillRect(0, 0, CANVAS_W, CANVAS_H);

        drawBlock(c, currentBlock, false);
        drawBlock(c, nextBlock, true);
        drawPawn(c);
        drawUI(c);

        if (gameStatus.value === 'playing' && isCharging) {
            drawAimGuide(c);
            drawPowerBar(c);
        }

        if (canvasCtx) {
            canvasCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
            canvasCtx.drawImage(offscreen!, 0, 0);
        }
    }

    function drawBlock(c: CanvasRenderingContext2D, block: Block, isNext: boolean) {
        const s = block.size;
        const h = block.height;
        const x = block.x - s / 2;
        const z = block.z - s / 2;

        const p00 = project(x, z, 0);
        const p10 = project(x + s, z, 0);
        const p11 = project(x + s, z + s, 0);
        const p01 = project(x, z + s, 0);

        const p0b = project(x, z, h);
        const p1b = project(x + s, z, h);
        const p2b = project(x + s, z + s, h);
        const p3b = project(x, z + s, h);

        const color = block.color;
        const leftColor = darkenColor(color, 0.5);
        const rightColor = darkenColor(color, 0.3);
        const topColor = color;
        const shadow = project(block.x, block.z, -4);

        c.save();
        c.fillStyle = 'rgba(0, 0, 0, 0.24)';
        c.beginPath();
        c.ellipse(shadow.x, shadow.y + h * 0.8, s * 0.72, s * 0.34, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();

        c.beginPath();
        c.moveTo(p00.x, p00.y);
        c.lineTo(p01.x, p01.y);
        c.lineTo(p3b.x, p3b.y);
        c.lineTo(p0b.x, p0b.y);
        c.closePath();
        c.fillStyle = leftColor;
        c.fill();
        c.strokeStyle = darkenColor(leftColor, 0.3);
        c.lineWidth = 1;
        c.stroke();

        const leftShade = c.createLinearGradient(p00.x, p00.y, p3b.x, p3b.y);
        leftShade.addColorStop(0, 'rgba(255,255,255,0.08)');
        leftShade.addColorStop(1, 'rgba(0,0,0,0.18)');
        c.fillStyle = leftShade;
        c.fill();

        c.beginPath();
        c.moveTo(p10.x, p10.y);
        c.lineTo(p11.x, p11.y);
        c.lineTo(p2b.x, p2b.y);
        c.lineTo(p1b.x, p1b.y);
        c.closePath();
        c.fillStyle = rightColor;
        c.fill();
        c.strokeStyle = darkenColor(rightColor, 0.3);
        c.lineWidth = 1;
        c.stroke();

        const rightShade = c.createLinearGradient(p10.x, p10.y, p2b.x, p2b.y);
        rightShade.addColorStop(0, 'rgba(255,255,255,0.12)');
        rightShade.addColorStop(1, 'rgba(0,0,0,0.16)');
        c.fillStyle = rightShade;
        c.fill();

        const topGrad = c.createLinearGradient(p00.x, p00.y, p11.x, p11.y);
        topGrad.addColorStop(0, lightenColor(topColor, 0.34));
        topGrad.addColorStop(0.55, lightenColor(topColor, 0.1));
        topGrad.addColorStop(1, topColor);
        c.beginPath();
        c.moveTo(p00.x, p00.y);
        c.lineTo(p10.x, p10.y);
        c.lineTo(p11.x, p11.y);
        c.lineTo(p01.x, p01.y);
        c.closePath();
        c.fillStyle = topGrad;
        c.fill();
        c.strokeStyle = darkenColor(topColor, 0.2);
        c.lineWidth = 1;
        c.stroke();

        const inset = s * 0.16;
        const i00 = project(x + inset, z + inset, h + 1);
        const i10 = project(x + s - inset, z + inset, h + 1);
        const i11 = project(x + s - inset, z + s - inset, h + 1);
        const i01 = project(x + inset, z + s - inset, h + 1);

        c.beginPath();
        c.moveTo(i00.x, i00.y);
        c.lineTo(i10.x, i10.y);
        c.lineTo(i11.x, i11.y);
        c.lineTo(i01.x, i01.y);
        c.closePath();
        c.strokeStyle = isNext ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.18)';
        c.lineWidth = isNext ? 2 : 1;
        c.stroke();

        const center = project(block.x, block.z, h + 2);
        const ringRx = Math.max(9, s * 0.23);
        const ringRy = Math.max(4, s * 0.11);
        c.save();
        c.lineWidth = isNext ? 3 : 1.5;
        c.strokeStyle = isNext ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.24)';
        c.beginPath();
        c.ellipse(center.x, center.y, ringRx, ringRy, 0, 0, Math.PI * 2);
        c.stroke();

        if (isNext) {
            c.fillStyle = 'rgba(255,255,255,0.16)';
            c.beginPath();
            c.ellipse(center.x, center.y, ringRx * 0.48, ringRy * 0.48, 0, 0, Math.PI * 2);
            c.fill();
        }
        c.restore();
    }

    function drawPawn(c: CanvasRenderingContext2D) {
        const pos = project(pawnX, pawnZ, BLOCK_HEIGHT + pawnY);
        const r = PAWN_RADIUS * pawnScale;

        if (r < 0.5) return;

        const charge = isCharging ? power / MAX_POWER : 0;
        const airborne = gameStatus.value === 'jumping';
        const shadowPos = project(pawnX, pawnZ, 0);
        const shadowScale = Math.max(0.42, 1 - pawnY / 170);
        c.fillStyle = 'rgba(0,0,0,0.24)';
        c.beginPath();
        c.ellipse(shadowPos.x, shadowPos.y + 4, r * 1.7 * shadowScale, r * 0.55 * shadowScale, 0, 0, Math.PI * 2);
        c.fill();

        const bodyH = PAWN_HEIGHT * pawnScale * (1 - charge * 0.16);
        const bodyW = r * (1.35 + charge * 0.38);
        const footY = pos.y - 2;
        const bodyTop = pos.y - bodyH;

        c.save();

        c.lineCap = 'round';
        c.strokeStyle = '#3f2f3d';
        c.lineWidth = Math.max(3, r * 0.36);
        c.beginPath();
        c.moveTo(pos.x - bodyW * 0.42, footY - bodyH * 0.1);
        c.lineTo(pos.x - bodyW * 0.86, footY + (airborne ? 3 : 1));
        c.moveTo(pos.x + bodyW * 0.42, footY - bodyH * 0.1);
        c.lineTo(pos.x + bodyW * 0.86, footY + (airborne ? -1 : 1));
        c.stroke();

        c.strokeStyle = '#ffd166';
        c.lineWidth = Math.max(2, r * 0.18);
        c.beginPath();
        c.moveTo(pos.x - bodyW * 0.78, footY + (airborne ? 3 : 1));
        c.lineTo(pos.x - bodyW * 1.04, footY + (airborne ? 3 : 1));
        c.moveTo(pos.x + bodyW * 0.78, footY + (airborne ? -1 : 1));
        c.lineTo(pos.x + bodyW * 1.04, footY + (airborne ? -1 : 1));
        c.stroke();

        const bodyGrad = c.createLinearGradient(pos.x - bodyW, bodyTop, pos.x + bodyW, pos.y);
        bodyGrad.addColorStop(0, '#7c3aed');
        bodyGrad.addColorStop(0.46, '#ec4899');
        bodyGrad.addColorStop(1, '#f97316');
        c.fillStyle = bodyGrad;
        c.beginPath();
        c.ellipse(pos.x, pos.y - bodyH * 0.48, bodyW, bodyH * 0.5, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.5)';
        c.lineWidth = 1.5;
        c.stroke();

        c.fillStyle = 'rgba(255,255,255,0.28)';
        c.beginPath();
        c.ellipse(pos.x - bodyW * 0.32, pos.y - bodyH * 0.64, bodyW * 0.26, bodyH * 0.14, -0.25, 0, Math.PI * 2);
        c.fill();

        const headGrad = c.createRadialGradient(
            pos.x - r * 0.35,
            bodyTop - r * 0.36,
            r * 0.1,
            pos.x,
            bodyTop,
            r * 1.15,
        );
        headGrad.addColorStop(0, '#fff7ed');
        headGrad.addColorStop(0.68, '#fed7aa');
        headGrad.addColorStop(1, '#fb923c');
        c.fillStyle = headGrad;
        c.beginPath();
        c.arc(pos.x, bodyTop - r * 0.15, r * 1.08, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = 'rgba(124,58,237,0.72)';
        c.lineWidth = 2;
        c.stroke();

        c.strokeStyle = '#7c2d12';
        c.lineWidth = Math.max(2, r * 0.2);
        c.beginPath();
        c.arc(pos.x, bodyTop - r * 0.38, r * 0.84, Math.PI * 1.08, Math.PI * 1.92);
        c.stroke();

        c.fillStyle = '#1f2937';
        c.beginPath();
        c.arc(pos.x - r * 0.36, bodyTop - r * 0.22, r * 0.16, 0, Math.PI * 2);
        c.fill();
        c.beginPath();
        c.arc(pos.x + r * 0.36, bodyTop - r * 0.22, r * 0.16, 0, Math.PI * 2);
        c.fill();

        c.strokeStyle = '#7c2d12';
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(pos.x, bodyTop + r * 0.04, r * 0.32, 0.12 * Math.PI, 0.88 * Math.PI);
        c.stroke();

        c.strokeStyle = '#f9a8d4';
        c.lineWidth = Math.max(2, r * 0.22);
        c.beginPath();
        c.moveTo(pos.x - bodyW * 0.72, pos.y - bodyH * 0.62);
        c.lineTo(pos.x - bodyW * 1.08, pos.y - bodyH * (airborne ? 1.02 : 0.82));
        c.moveTo(pos.x + bodyW * 0.72, pos.y - bodyH * 0.62);
        c.lineTo(pos.x + bodyW * 1.08, pos.y - bodyH * (airborne ? 0.92 : 0.82));
        c.stroke();

        c.restore();
    }

    function drawPowerBar(c: CanvasRenderingContext2D) {
        const barW = 160;
        const barH = 10;
        const bx = (CANVAS_W - barW) / 2;
        const by = CANVAS_H - 40;
        const fill = power / MAX_POWER;

        c.fillStyle = 'rgba(0,0,0,0.4)';
        c.beginPath();
        c.roundRect(bx - 2, by - 2, barW + 4, barH + 4, 7);
        c.fill();

        const grad = c.createLinearGradient(bx, 0, bx + barW, 0);
        grad.addColorStop(0, '#4ade80');
        grad.addColorStop(0.5, '#facc15');
        grad.addColorStop(1, '#ef4444');
        c.fillStyle = grad;
        c.beginPath();
        c.roundRect(bx, by, barW * fill, barH, 5);
        c.fill();

        const targetFill = Math.max(
            0,
            Math.min(1, (distanceToNextCenter() - MIN_JUMP_DIST) / (MAX_JUMP_DIST - MIN_JUMP_DIST)),
        );
        const tx = bx + barW * targetFill;
        c.strokeStyle = 'rgba(255,255,255,0.9)';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(tx, by - 4);
        c.lineTo(tx, by + barH + 4);
        c.stroke();

        c.fillStyle = 'rgba(255,255,255,0.9)';
        c.font = 'bold 12px Arial';
        c.textAlign = 'center';
        c.fillText(`蓄力 ${Math.round(fill * 100)}%`, CANVAS_W / 2, by + barH + 18);
    }

    function drawAimGuide(c: CanvasRenderingContext2D) {
        const start = project(pawnX, pawnZ, BLOCK_HEIGHT + 4);
        const target = project(nextBlock.x, nextBlock.z, BLOCK_HEIGHT + 4);
        c.save();
        c.setLineDash([7, 6]);
        c.strokeStyle = 'rgba(255,255,255,0.35)';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(start.x, start.y);
        c.lineTo(target.x, target.y);
        c.stroke();
        c.setLineDash([]);
        c.fillStyle = 'rgba(255,255,255,0.75)';
        c.beginPath();
        c.arc(target.x, target.y, 4, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }

    function drawUI(c: CanvasRenderingContext2D) {
        c.textAlign = 'left';
        c.font = 'bold 16px Arial';
        c.fillStyle = 'rgba(255,255,255,0.7)';
        c.fillText(`分数: ${score.value}`, 16, 30);
        c.fillStyle = 'rgba(255,200,0,0.7)';
        c.fillText(`最高: ${bestScore.value}`, 16, 54);

        if (feedbackText) {
            const t = Math.min(feedbackElapsed / 1.1, 1);
            const pos = project(pawnX, pawnZ, BLOCK_HEIGHT + 56 + t * 24);
            c.textAlign = 'center';
            c.font = 'bold 18px Arial';
            c.fillStyle = `rgba(255,255,255,${1 - t})`;
            c.fillText(feedbackText, pos.x, pos.y);
        }
    }

    function gameLoop(time: number) {
        const dt = Math.min(time - lastTime, 50) / 1000;
        lastTime = time;

        if (gameStatus.value === 'idle') {
            render();
            rafId = null;
            return;
        }

        update(dt);
        render();

        if (gameStatus.value !== 'dead' || isFalling || feedbackText) {
            rafId = requestAnimationFrame(gameLoop);
        } else {
            rafId = null;
        }
    }

    function setCanvas(ctx: CanvasRenderingContext2D) {
        canvasCtx = ctx;
        if (!offscreen) initOffscreen();
        render();
    }

    function handlePointerDown(e?: PointerEvent) {
        if (e?.currentTarget instanceof HTMLElement) {
            e.currentTarget.setPointerCapture(e.pointerId);
        }
        if (gameStatus.value === 'idle') {
            startGame();
            return;
        }
        startCharge();
    }

    function handlePointerUp(e?: PointerEvent) {
        if (e?.currentTarget instanceof HTMLElement && e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        releaseJump();
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === ' ' || e.key === 'Space' || e.key === 'Enter') {
            e.preventDefault();
            if (gameStatus.value === 'idle') {
                startGame();
            } else if (gameStatus.value === 'playing') {
                startCharge();
            }
        }
    }

    function handleKeyup(e: KeyboardEvent) {
        if (e.key === ' ' || e.key === 'Space' || e.key === 'Enter') {
            e.preventDefault();
            releaseJump();
        }
    }

    function dispose() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        canvasCtx = null;
    }

    const width = CANVAS_W;
    const height = CANVAS_H;

    resetGame();

    return {
        gameStatus,
        score,
        bestScore,
        width,
        height,
        startGame,
        setCanvas,
        handlePointerDown,
        handlePointerUp,
        handleKeydown,
        handleKeyup,
        dispose,
    };
}

function darkenColor(hex: string, factor: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const nr = Math.round(r * (1 - factor));
    const ng = Math.round(g * (1 - factor));
    const nb = Math.round(b * (1 - factor));
    return `rgb(${nr},${ng},${nb})`;
}

function lightenColor(hex: string, factor: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const nr = Math.min(255, Math.round(r + (255 - r) * factor));
    const ng = Math.min(255, Math.round(g + (255 - g) * factor));
    const nb = Math.min(255, Math.round(b + (255 - b) * factor));
    return `rgb(${nr},${ng},${nb})`;
}
