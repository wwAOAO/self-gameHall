import { ref } from 'vue';

const CANVAS_W = 400;
const CANVAS_H = 600;
const GRAVITY = 1350;
const JUMP_FORCE = -390;
const PIPE_WIDTH = 52;
const PIPE_GAP_START = 158;
const PIPE_GAP_MIN = 122;
const PIPE_SPEED_START = 150;
const PIPE_SPEED_MAX = 230;
const PIPE_SPAWN_INTERVAL_START = 1.55;
const PIPE_SPAWN_INTERVAL_MIN = 1.18;
const BIRD_X = 80;
const GROUND_H = 60;
const FLY_AREA = CANVAS_H - GROUND_H;
const BIRD_COLLISION_RADIUS = 11;
const MAX_DT = 1 / 30;
const FIRST_PIPE_DELAY = 0.75;

interface Pipe {
    x: number;
    gapY: number;
    gap: number;
    scored: boolean;
}

interface Cloud {
    x: number;
    y: number;
    w: number;
    speed: number;
}

export function useFlappyBird() {
    const gameStatus = ref<'idle' | 'playing' | 'dead'>('idle');
    const score = ref(0);
    const bestScore = ref(Number(localStorage.getItem('flappy-best') || 0));

    let birdY = CANVAS_H / 2;
    let birdV = 0;
    let birdRot = 0;
    let wingPhase = 0;
    let pipes: Pipe[] = [];
    let clouds: Cloud[] = [];
    let pipeTimer = 0;
    let spawnDelay = FIRST_PIPE_DELAY;
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

    function initClouds() {
        clouds = [];
        for (let i = 0; i < 4; i++) {
            clouds.push({
                x: Math.random() * CANVAS_W,
                y: 30 + Math.random() * 100,
                w: 50 + Math.random() * 50,
                speed: 0.2 + Math.random() * 0.3,
            });
        }
    }

    function reset() {
        birdY = CANVAS_H / 2;
        birdV = 0;
        birdRot = 0;
        wingPhase = 0;
        pipes = [];
        pipeTimer = 0;
        spawnDelay = FIRST_PIPE_DELAY;
        lastTime = 0;
        score.value = 0;
        initClouds();
    }

    function startGame() {
        reset();
        gameStatus.value = 'playing';
        lastTime = performance.now();
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(gameLoop);
    }

    function jump() {
        if (gameStatus.value === 'idle' || gameStatus.value === 'dead') {
            startGame();
        } else if (gameStatus.value !== 'playing') {
            return;
        }

        birdV = JUMP_FORCE;
        birdRot = -0.45;
    }

    function spawnPipe() {
        const gap = getPipeGap();
        const minGap = 72;
        const maxGap = FLY_AREA - gap - 34;
        const lastGapY = pipes[pipes.length - 1]?.gapY ?? CANVAS_H / 2 - gap / 2;
        const targetGapY = minGap + Math.random() * Math.max(0, maxGap - minGap);
        const maxShift = 96;
        const gapY = Math.max(
            minGap,
            Math.min(maxGap, lastGapY + Math.max(-maxShift, Math.min(maxShift, targetGapY - lastGapY))),
        );
        pipes.push({ x: CANVAS_W, gapY, gap, scored: false });
    }

    function getDifficulty() {
        return Math.min(score.value / 18, 1);
    }

    function getPipeGap() {
        const difficulty = getDifficulty();
        return PIPE_GAP_START - (PIPE_GAP_START - PIPE_GAP_MIN) * difficulty;
    }

    function getPipeSpeed() {
        const difficulty = getDifficulty();
        return PIPE_SPEED_START + (PIPE_SPEED_MAX - PIPE_SPEED_START) * difficulty;
    }

    function getPipeSpawnInterval() {
        const difficulty = getDifficulty();
        return PIPE_SPAWN_INTERVAL_START - (PIPE_SPAWN_INTERVAL_START - PIPE_SPAWN_INTERVAL_MIN) * difficulty;
    }

    function updateBest() {
        if (score.value > bestScore.value) {
            bestScore.value = score.value;
            localStorage.setItem('flappy-best', String(bestScore.value));
        }
    }

    function update(dt: number) {
        if (gameStatus.value !== 'playing') return;

        birdV += GRAVITY * dt;
        birdY += birdV * dt;
        birdRot = Math.min(Math.max(birdV * 0.002, -0.5), Math.PI / 2);
        wingPhase += 11 * dt;

        if (birdY + BIRD_COLLISION_RADIUS >= FLY_AREA) {
            birdY = FLY_AREA - BIRD_COLLISION_RADIUS;
            gameStatus.value = 'dead';
            updateBest();
            return;
        }
        if (birdY - BIRD_COLLISION_RADIUS <= 0) {
            birdY = BIRD_COLLISION_RADIUS;
            birdV = 0;
        }

        if (spawnDelay > 0) {
            spawnDelay -= dt;
            if (spawnDelay <= 0) {
                spawnPipe();
                pipeTimer = 0;
            }
        } else {
            pipeTimer += dt;
        }

        const spawnInterval = getPipeSpawnInterval();
        while (pipeTimer >= spawnInterval) {
            pipeTimer -= spawnInterval;
            spawnPipe();
        }

        const pipeSpeed = getPipeSpeed();
        for (const pipe of pipes) {
            pipe.x -= pipeSpeed * dt;

            if (!pipe.scored && pipe.x + PIPE_WIDTH < BIRD_X) {
                pipe.scored = true;
                score.value++;
            }

            const r = BIRD_COLLISION_RADIUS;
            if (BIRD_X + r > pipe.x && BIRD_X - r < pipe.x + PIPE_WIDTH) {
                if (birdY - r < pipe.gapY || birdY + r > pipe.gapY + pipe.gap) {
                    gameStatus.value = 'dead';
                    updateBest();
                    return;
                }
            }
        }

        pipes = pipes.filter(p => p.x + PIPE_WIDTH > -50);

        for (const cloud of clouds) {
            cloud.x -= cloud.speed * dt * 60;
            if (cloud.x + cloud.w < -20) {
                cloud.x = CANVAS_W + 20;
                cloud.y = 30 + Math.random() * 100;
                cloud.w = 50 + Math.random() * 50;
            }
        }
    }

    function render() {
        if (!offCtx) return;
        const c = offCtx;
        c.clearRect(0, 0, CANVAS_W, CANVAS_H);

        drawBackground(c);

        for (const cloud of clouds) {
            drawCloud(c, cloud);
        }

        for (const pipe of pipes) {
            drawPipe(c, pipe);
        }

        drawGround(c);
        drawBird(c);
        drawScore(c);

        if (canvasCtx) {
            canvasCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
            canvasCtx.drawImage(offscreen!, 0, 0);
        }
    }

    function drawBackground(c: CanvasRenderingContext2D) {
        const sky = c.createLinearGradient(0, 0, 0, CANVAS_H);
        sky.addColorStop(0, '#22b8f0');
        sky.addColorStop(0.48, '#72d6ff');
        sky.addColorStop(1, '#d7f7ff');
        c.fillStyle = sky;
        c.fillRect(0, 0, CANVAS_W, CANVAS_H);

        const sun = c.createRadialGradient(316, 76, 12, 316, 76, 72);
        sun.addColorStop(0, 'rgba(255,255,214,0.95)');
        sun.addColorStop(0.35, 'rgba(255,225,125,0.34)');
        sun.addColorStop(1, 'rgba(255,225,125,0)');
        c.fillStyle = sun;
        c.beginPath();
        c.arc(316, 76, 72, 0, Math.PI * 2);
        c.fill();

        c.fillStyle = 'rgba(255,255,236,0.95)';
        c.beginPath();
        c.arc(316, 76, 24, 0, Math.PI * 2);
        c.fill();

        drawHills(c, 0, 424, '#59b87b', '#3d9668', 0.45);
        drawHills(c, 80, 460, '#7bcf89', '#58ad75', 0.68);

        c.fillStyle = 'rgba(255,255,255,0.12)';
        for (let y = 130; y < FLY_AREA - 60; y += 42) {
            c.fillRect(0, y, CANVAS_W, 1);
        }
    }

    function drawHills(
        c: CanvasRenderingContext2D,
        offset: number,
        baseY: number,
        top: string,
        bottom: string,
        alpha: number,
    ) {
        c.save();
        c.globalAlpha = alpha;
        const grad = c.createLinearGradient(0, baseY - 90, 0, baseY);
        grad.addColorStop(0, top);
        grad.addColorStop(1, bottom);
        c.fillStyle = grad;
        c.beginPath();
        c.moveTo(0, baseY);
        for (let x = -80; x <= CANVAS_W + 90; x += 40) {
            const px = x + offset;
            const y = baseY - 42 - Math.sin((x + offset) * 0.025) * 24 - Math.cos(x * 0.04) * 10;
            c.quadraticCurveTo(px + 20, y - 24, px + 40, y);
        }
        c.lineTo(CANVAS_W, baseY);
        c.closePath();
        c.fill();
        c.restore();
    }

    function drawCloud(c: CanvasRenderingContext2D, cloud: Cloud) {
        c.save();
        c.shadowColor = 'rgba(14, 116, 144, 0.14)';
        c.shadowBlur = 12;
        c.shadowOffsetY = 5;
        c.fillStyle = 'rgba(255,255,255,0.88)';
        c.beginPath();
        c.ellipse(cloud.x, cloud.y, cloud.w / 2, 15, 0, 0, Math.PI * 2);
        c.ellipse(cloud.x - cloud.w * 0.24, cloud.y + 4, cloud.w * 0.32, 11, 0, 0, Math.PI * 2);
        c.ellipse(cloud.x + cloud.w * 0.24, cloud.y + 3, cloud.w * 0.28, 10, 0, 0, Math.PI * 2);
        c.ellipse(cloud.x - cloud.w * 0.04, cloud.y - 9, cloud.w * 0.28, 13, 0, 0, Math.PI * 2);
        c.fill();

        c.shadowColor = 'transparent';
        c.fillStyle = 'rgba(255,255,255,0.45)';
        c.beginPath();
        c.ellipse(cloud.x - cloud.w * 0.14, cloud.y - 7, cloud.w * 0.22, 6, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }

    function drawGround(c: CanvasRenderingContext2D) {
        const dirt = c.createLinearGradient(0, FLY_AREA, 0, CANVAS_H);
        dirt.addColorStop(0, '#8b5a2b');
        dirt.addColorStop(0.42, '#6f421e');
        dirt.addColorStop(1, '#4c2c15');
        c.fillStyle = dirt;
        c.fillRect(0, FLY_AREA, CANVAS_W, GROUND_H);

        const grass = c.createLinearGradient(0, FLY_AREA - 10, 0, FLY_AREA + 16);
        grass.addColorStop(0, '#9be15d');
        grass.addColorStop(0.42, '#35b653');
        grass.addColorStop(1, '#208a42');
        c.fillStyle = grass;
        c.fillRect(0, FLY_AREA - 8, CANVAS_W, 20);

        c.fillStyle = 'rgba(255,255,255,0.28)';
        c.fillRect(0, FLY_AREA - 8, CANVAS_W, 2);

        for (let i = -4; i < CANVAS_W + 10; i += 9) {
            const gh = 7 + Math.sin(i * 0.31) * 3;
            c.fillStyle = i % 18 === 0 ? '#b8f36a' : '#61c653';
            c.beginPath();
            c.moveTo(i, FLY_AREA - 8);
            c.lineTo(i + 4, FLY_AREA - 8 - gh);
            c.lineTo(i + 8, FLY_AREA - 8);
            c.closePath();
            c.fill();
        }

        c.fillStyle = 'rgba(255, 221, 150, 0.2)';
        for (let y = FLY_AREA + 20; y < CANVAS_H; y += 17) {
            for (let x = (y % 34) - 20; x < CANVAS_W; x += 34) {
                c.fillRect(x, y, 18, 3);
            }
        }
    }

    function drawScore(c: CanvasRenderingContext2D) {
        if (gameStatus.value === 'playing' || gameStatus.value === 'dead') {
            c.textAlign = 'center';
            c.font = '900 42px Arial';
            c.lineWidth = 7;
            c.strokeStyle = 'rgba(7, 27, 43, 0.56)';
            c.strokeText(String(score.value), CANVAS_W / 2, 58);
            c.fillStyle = '#ffffff';
            c.fillText(String(score.value), CANVAS_W / 2, 58);
            c.fillStyle = 'rgba(255,255,255,0.34)';
            c.fillText(String(score.value), CANVAS_W / 2 - 2, 55);
        }
    }

    function drawBird(c: CanvasRenderingContext2D) {
        c.save();

        c.fillStyle = 'rgba(13, 43, 68, 0.18)';
        c.beginPath();
        c.ellipse(BIRD_X - 4, FLY_AREA - 12, 18, 5, 0, 0, Math.PI * 2);
        c.fill();

        c.translate(BIRD_X, birdY);
        c.rotate(birdRot);

        const r = 14;

        c.shadowColor = 'rgba(7, 27, 43, 0.22)';
        c.shadowBlur = 8;
        c.shadowOffsetY = 4;
        const bodyGrad = c.createRadialGradient(-5, -7, 4, 0, 0, r + 4);
        bodyGrad.addColorStop(0, '#fff38a');
        bodyGrad.addColorStop(0.52, '#f7cf3e');
        bodyGrad.addColorStop(1, '#d99f22');
        c.fillStyle = bodyGrad;
        c.beginPath();
        c.arc(0, 0, r, 0, Math.PI * 2);
        c.fill();
        c.shadowColor = 'transparent';
        c.strokeStyle = '#c4a830';
        c.lineWidth = 2;
        c.stroke();

        c.fillStyle = 'rgba(255,255,255,0.38)';
        c.beginPath();
        c.ellipse(-4, -6, 5, 3, -0.4, 0, Math.PI * 2);
        c.fill();

        c.fillStyle = '#ffe88c';
        c.beginPath();
        c.ellipse(2, 5, 7, 5, 0, 0, Math.PI * 2);
        c.fill();

        const wingAngle = Math.sin(wingPhase) * 0.45;
        c.save();
        c.translate(-3, -1);
        c.rotate(wingAngle);
        const wingGrad = c.createLinearGradient(-8, -13, 6, 6);
        wingGrad.addColorStop(0, '#ffe16b');
        wingGrad.addColorStop(1, '#c89721');
        c.fillStyle = wingGrad;
        c.beginPath();
        c.ellipse(0, -r + 3, 8, 13, -0.2, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#b8a020';
        c.lineWidth = 1;
        c.stroke();
        c.restore();

        c.fillStyle = '#fff';
        c.beginPath();
        c.arc(6, -4, 5, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#222';
        c.beginPath();
        c.arc(7, -4, 2.5, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#fff';
        c.beginPath();
        c.arc(8, -6, 1, 0, Math.PI * 2);
        c.fill();

        const beakGrad = c.createLinearGradient(12, 0, 22, 5);
        beakGrad.addColorStop(0, '#ffd166');
        beakGrad.addColorStop(1, '#f97316');
        c.fillStyle = beakGrad;
        c.beginPath();
        c.moveTo(12, 0);
        c.lineTo(22, 2);
        c.lineTo(12, 5);
        c.closePath();
        c.fill();
        c.strokeStyle = '#e07800';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(12, 2.5);
        c.lineTo(20, 2.5);
        c.stroke();

        c.fillStyle = '#c89721';
        c.beginPath();
        c.moveTo(-12, -2);
        c.lineTo(-20, -7);
        c.lineTo(-17, -1);
        c.closePath();
        c.fill();
        c.beginPath();
        c.moveTo(-12, 2);
        c.lineTo(-22, 4);
        c.lineTo(-17, 6);
        c.closePath();
        c.fill();

        c.restore();
    }

    function drawPipe(c: CanvasRenderingContext2D, pipe: Pipe) {
        const x = pipe.x;
        const w = PIPE_WIDTH;
        const gt = pipe.gapY;
        const gb = pipe.gapY + pipe.gap;
        const btmH = FLY_AREA - gb;

        const gradTop = c.createLinearGradient(x, 0, x + w, 0);
        gradTop.addColorStop(0, '#166534');
        gradTop.addColorStop(0.16, '#22c55e');
        gradTop.addColorStop(0.48, '#16a34a');
        gradTop.addColorStop(0.82, '#4ade80');
        gradTop.addColorStop(1, '#14532d');

        c.save();
        c.shadowColor = 'rgba(15, 23, 42, 0.18)';
        c.shadowBlur = 10;
        c.shadowOffsetX = -4;
        c.fillStyle = gradTop;
        c.fillRect(x, 0, w, gt);
        c.restore();

        c.fillStyle = '#15803d';
        c.fillRect(x - 5, gt - 25, w + 10, 25);
        c.fillStyle = gradTop;
        c.fillRect(x - 1, gt - 22, w + 2, 18);
        c.fillStyle = 'rgba(255,255,255,0.18)';
        c.fillRect(x + 8, 0, 7, Math.max(0, gt - 28));
        c.fillRect(x + 8, gt - 20, 7, 16);
        c.strokeStyle = '#0f5130';
        c.lineWidth = 2;
        c.strokeRect(x - 5, gt - 25, w + 10, 25);
        c.strokeRect(x, 0, w, gt);

        const gradBtm = c.createLinearGradient(x, gb, x + w, gb);
        gradBtm.addColorStop(0, '#166534');
        gradBtm.addColorStop(0.16, '#22c55e');
        gradBtm.addColorStop(0.48, '#16a34a');
        gradBtm.addColorStop(0.82, '#4ade80');
        gradBtm.addColorStop(1, '#14532d');

        c.save();
        c.shadowColor = 'rgba(15, 23, 42, 0.18)';
        c.shadowBlur = 10;
        c.shadowOffsetX = -4;
        c.fillStyle = gradBtm;
        c.fillRect(x, gb, w, btmH);
        c.restore();

        c.fillStyle = '#15803d';
        c.fillRect(x - 5, gb, w + 10, 25);
        c.fillStyle = gradBtm;
        c.fillRect(x - 1, gb + 3, w + 2, 18);
        c.fillStyle = 'rgba(255,255,255,0.18)';
        c.fillRect(x + 8, gb + 28, 7, Math.max(0, btmH - 28));
        c.fillRect(x + 8, gb + 5, 7, 16);
        c.strokeStyle = '#0f5130';
        c.lineWidth = 2;
        c.strokeRect(x - 5, gb, w + 10, 25);
        c.strokeRect(x, gb, w, btmH);
    }

    function gameLoop(time: number) {
        if (gameStatus.value !== 'playing') {
            rafId = null;
            return;
        }
        const dt = Math.min(time - lastTime, 50);
        lastTime = time;
        update(Math.min(dt / 1000, MAX_DT));
        render();
        rafId = requestAnimationFrame(gameLoop);
    }

    function draw(ctx: CanvasRenderingContext2D) {
        canvasCtx = ctx;
        if (!offscreen) initOffscreen();
        render();
    }

    function setCanvas(ctx: CanvasRenderingContext2D) {
        canvasCtx = ctx;
        if (!offscreen) initOffscreen();
    }

    function handleKeydown(e: KeyboardEvent) {
        if (
            e.key === ' ' ||
            e.key === 'Space' ||
            e.key === 'ArrowUp' ||
            e.key === 'w' ||
            e.key === 'W' ||
            e.key === 'Enter'
        ) {
            e.preventDefault();
            jump();
        }
    }

    function handleKeyup(_e: KeyboardEvent) {}

    function stopGameLoop() {
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    }

    const width = CANVAS_W;
    const height = CANVAS_H;

    return {
        gameStatus,
        score,
        bestScore,
        width,
        height,
        startGame,
        draw,
        handleKeydown,
        handleKeyup,
        setCanvas,
        jump,
        stopGameLoop,
    };
}
