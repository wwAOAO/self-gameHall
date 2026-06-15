import { ref, onUnmounted } from 'vue';

const CANVAS_W = 600;
const CANVAS_H = 600;
const TILE = 30;
const COLS = CANVAS_W / TILE;
const ROWS = CANVAS_H / TILE;
const PLAYER_SPEED = 126;
const ENEMY_BASE_SPEED = 72;
const BULLET_SPEED = 330;
const PLAYER_SHOT_COOLDOWN = 360;
const ENEMY_SHOT_COOLDOWN = 1180;
const ENEMY_DECISION_INTERVAL = 520;
const MAX_ENEMIES = 4;
const BASE_SPAWN_INTERVAL = 3600;
const TOTAL_LIVES = 3;
const BULLET_RADIUS = 4;

type Direction = 'up' | 'down' | 'left' | 'right';

interface Tank {
    id: number;
    x: number;
    y: number;
    w: number;
    h: number;
    dir: Direction;
    speed: number;
    isPlayer: boolean;
    cooldown: number;
    alive: boolean;
    nextDecisionAt: number;
    targetDir: Direction;
    stuckUntil: number;
    spawnGraceUntil: number;
}

interface Bullet {
    x: number;
    y: number;
    prevX: number;
    prevY: number;
    dx: number;
    dy: number;
    isPlayer: boolean;
}

interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

interface Wall extends Rect {
    kind: 'brick' | 'steel';
    hp: number;
}

const dirs: Direction[] = ['up', 'down', 'left', 'right'];

function tileCenter(col: number): number {
    return col * TILE + TILE / 2;
}

function rowCenter(row: number): number {
    return row * TILE + TILE / 2;
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function directionVector(dir: Direction) {
    switch (dir) {
        case 'up':
            return { x: 0, y: -1 };
        case 'down':
            return { x: 0, y: 1 };
        case 'left':
            return { x: -1, y: 0 };
        case 'right':
            return { x: 1, y: 0 };
    }
}

function preferredAxisDirection(from: { x: number; y: number }, to: { x: number; y: number }): Direction {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'down' : 'up';
}

function oppositeDir(dir: Direction): Direction {
    switch (dir) {
        case 'up':
            return 'down';
        case 'down':
            return 'up';
        case 'left':
            return 'right';
        case 'right':
            return 'left';
    }
}

function rectCollide(a: Rect, b: Rect) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function pointInRect(x: number, y: number, rect: Rect) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function segmentHitsRect(x1: number, y1: number, x2: number, y2: number, rect: Rect) {
    const expanded = {
        x: rect.x - BULLET_RADIUS,
        y: rect.y - BULLET_RADIUS,
        w: rect.w + BULLET_RADIUS * 2,
        h: rect.h + BULLET_RADIUS * 2,
    };
    if (pointInRect(x2, y2, expanded)) return true;

    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 6));
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        if (pointInRect(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, expanded)) return true;
    }
    return false;
}

export function useTankBattle() {
    const gameStatus = ref<'idle' | 'playing' | 'lost'>('idle');
    const score = ref(0);
    const highScore = ref(Number(localStorage.getItem('tank-high-score') || 0));
    const kills = ref(0);
    const wave = ref(1);
    const lives = ref(TOTAL_LIVES);
    const message = ref('保卫基地，消灭来袭坦克');

    const player = ref<Tank>(createPlayer());
    const enemies = ref<Tank[]>([]);
    const bullets = ref<Bullet[]>([]);
    const walls = ref<Wall[]>([]);
    const base = ref({ x: 9, y: 18, w: 2, h: 2, alive: true });
    const nextSpawnTime = ref(0);

    const keys = ref<Set<string>>(new Set());

    let rafId: number | null = null;
    let lastTime = 0;
    let tankId = 1;

    function createPlayer(): Tank {
        return {
            id: 0,
            x: tileCenter(COLS / 2),
            y: rowCenter(17),
            w: TILE - 4,
            h: TILE - 4,
            dir: 'up',
            speed: PLAYER_SPEED,
            isPlayer: true,
            cooldown: 0,
            alive: true,
            nextDecisionAt: 0,
            targetDir: 'up',
            stuckUntil: 0,
            spawnGraceUntil: 0,
        };
    }

    function createEnemy(x: number, y: number): Tank {
        const speedBonus = Math.min(34, (wave.value - 1) * 5);
        return {
            id: tankId++,
            x,
            y,
            w: TILE - 4,
            h: TILE - 4,
            dir: 'down',
            speed: ENEMY_BASE_SPEED + speedBonus + Math.random() * 14,
            isPlayer: false,
            cooldown: performance.now() + 450 + Math.random() * 900,
            alive: true,
            nextDecisionAt: 0,
            targetDir: 'down',
            stuckUntil: 0,
            spawnGraceUntil: performance.now() + 800,
        };
    }

    function generateWalls() {
        const ws: Wall[] = [];
        const addWall = (col: number, row: number, w = 1, h = 1, kind: Wall['kind'] = 'brick') => {
            ws.push({
                x: col * TILE,
                y: row * TILE,
                w: w * TILE,
                h: h * TILE,
                kind,
                hp: kind === 'steel' ? 999 : w * h,
            });
        };

        for (const [col, row] of [
            [2, 5],
            [5, 5],
            [8, 5],
            [11, 5],
            [14, 5],
            [17, 5],
            [2, 8],
            [5, 8],
            [8, 8],
            [11, 8],
            [14, 8],
            [17, 8],
            [1, 11],
            [3, 11],
            [5, 11],
            [7, 11],
            [9, 11],
            [11, 11],
            [13, 11],
            [15, 11],
            [17, 11],
            [2, 14],
            [5, 14],
            [8, 14],
            [11, 14],
            [14, 14],
            [17, 14],
        ]) {
            addWall(col, row);
        }

        addWall(7, 2, 1, 1, 'steel');
        addWall(12, 2, 1, 1, 'steel');
        addWall(9, 15, 2, 1);
        addWall(8, 18);
        addWall(11, 18);
        addWall(8, 19);
        addWall(11, 19);
        walls.value = ws;
    }

    function baseRect(): Rect {
        return { x: base.value.x * TILE, y: base.value.y * TILE, w: base.value.w * TILE, h: base.value.h * TILE };
    }

    function getTankRect(tank: Tank): Rect {
        return { x: tank.x - tank.w / 2, y: tank.y - tank.h / 2, w: tank.w, h: tank.h };
    }

    function canMove(tank: Tank, nx: number, ny: number): boolean {
        const rect = { x: nx - tank.w / 2, y: ny - tank.h / 2, w: tank.w, h: tank.h };
        if (rect.x < 0 || rect.x + rect.w > CANVAS_W || rect.y < 0 || rect.y + rect.h > CANVAS_H) return false;

        for (const wall of walls.value) {
            if (rectCollide(rect, wall)) return false;
        }

        if (base.value.alive && rectCollide(rect, baseRect())) return false;

        for (const other of enemies.value) {
            if (other.alive && other.id !== tank.id && rectCollide(rect, getTankRect(other))) return false;
        }

        if (!tank.isPlayer && player.value.alive && rectCollide(rect, getTankRect(player.value))) return false;
        if (tank.isPlayer) {
            for (const enemy of enemies.value) {
                if (enemy.alive && rectCollide(rect, getTankRect(enemy))) return false;
            }
        }

        return true;
    }

    function moveTank(tank: Tank, dx: number, dy: number) {
        if (dx === 0 && dy === 0) return true;

        let moved = false;
        const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4);
        const sx = dx / steps;
        const sy = dy / steps;

        for (let i = 0; i < steps; i++) {
            if (canMove(tank, tank.x + sx, tank.y + sy)) {
                tank.x += sx;
                tank.y += sy;
                moved = true;
            } else {
                break;
            }
        }
        return moved;
    }

    function getSpawnPosition(): { x: number; y: number } | null {
        const spawnTiles: [number, number][] = [
            [1, 1],
            [COLS - 2, 1],
            [Math.floor(COLS / 2), 1],
        ];
        const shuffled = [...spawnTiles].sort(() => Math.random() - 0.5);

        for (const [col, row] of shuffled) {
            const cx = tileCenter(col);
            const cy = rowCenter(row);
            const testTank: Tank = {
                id: -1,
                x: cx,
                y: cy,
                w: TILE - 4,
                h: TILE - 4,
                dir: 'down',
                speed: ENEMY_BASE_SPEED,
                isPlayer: false,
                cooldown: 0,
                alive: true,
                nextDecisionAt: 0,
                targetDir: 'down',
                stuckUntil: 0,
                spawnGraceUntil: 0,
            };
            if (!canMove(testTank, cx, cy)) continue;

            const tooCloseToPlayer = Math.hypot(cx - player.value.x, cy - player.value.y) < TILE * 5;
            if (player.value.alive && tooCloseToPlayer) continue;

            return { x: Math.round(cx), y: Math.round(cy) };
        }
        return null;
    }

    function spawnOneEnemy(now = performance.now()) {
        const aliveCount = enemies.value.filter(e => e.alive).length;
        if (aliveCount >= MAX_ENEMIES) return false;

        const pos = getSpawnPosition();
        if (!pos) return false;

        enemies.value.push(createEnemy(pos.x, pos.y));
        nextSpawnTime.value = now + currentSpawnInterval();
        return true;
    }

    function currentSpawnInterval() {
        return Math.max(1350, BASE_SPAWN_INTERVAL - (wave.value - 1) * 220);
    }

    function startGame() {
        score.value = 0;
        kills.value = 0;
        wave.value = 1;
        lives.value = TOTAL_LIVES;
        message.value = '保卫基地，消灭来袭坦克';
        bullets.value = [];
        keys.value = new Set();
        enemies.value = [];
        player.value = createPlayer();
        base.value = { x: 9, y: 18, w: 2, h: 2, alive: true };
        tankId = 1;

        generateWalls();

        gameStatus.value = 'playing';
        const now = performance.now();
        lastTime = now;
        nextSpawnTime.value = now;
        spawnOneEnemy(now);
        spawnOneEnemy(now + 400);
        nextSpawnTime.value = now + 1800;

        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(gameLoop);
    }

    function fire(tank: Tank, now = performance.now()) {
        if (!tank.alive || now < tank.cooldown) return false;
        const vector = directionVector(tank.dir);
        const muzzleOffset = Math.max(tank.w, tank.h) / 2 + BULLET_RADIUS + 1;
        const x = tank.x + vector.x * muzzleOffset;
        const y = tank.y + vector.y * muzzleOffset;

        bullets.value.push({
            x,
            y,
            prevX: x,
            prevY: y,
            dx: vector.x * BULLET_SPEED,
            dy: vector.y * BULLET_SPEED,
            isPlayer: tank.isPlayer,
        });

        tank.cooldown = now + (tank.isPlayer ? PLAYER_SHOT_COOLDOWN : ENEMY_SHOT_COOLDOWN + Math.random() * 450);
        return true;
    }

    function updatePlayer(dt: number, now: number) {
        const p = player.value;
        if (!p.alive) return;

        let nextDir: Direction | null = null;
        if (keys.value.has('ArrowLeft') || keys.value.has('a') || keys.value.has('A')) nextDir = 'left';
        else if (keys.value.has('ArrowRight') || keys.value.has('d') || keys.value.has('D')) nextDir = 'right';
        else if (keys.value.has('ArrowUp') || keys.value.has('w') || keys.value.has('W')) nextDir = 'up';
        else if (keys.value.has('ArrowDown') || keys.value.has('s') || keys.value.has('S')) nextDir = 'down';

        if (nextDir) {
            p.dir = nextDir;
            const vector = directionVector(nextDir);
            const distance = p.speed * dt;
            moveTank(p, vector.x * distance, vector.y * distance);
        }

        if ((keys.value.has(' ') || keys.value.has('Space')) && fire(p, now)) {
            message.value = '开火！';
        }
    }

    function canShootTarget(tank: Tank, target: Rect) {
        const vector = directionVector(tank.dir);
        const sameColumn = Math.abs(tank.x - (target.x + target.w / 2)) < target.w / 2 + 4;
        const sameRow = Math.abs(tank.y - (target.y + target.h / 2)) < target.h / 2 + 4;
        const targetAhead =
            (tank.dir === 'up' && target.y + target.h < tank.y) ||
            (tank.dir === 'down' && target.y > tank.y) ||
            (tank.dir === 'left' && target.x + target.w < tank.x) ||
            (tank.dir === 'right' && target.x > tank.x);

        if (!targetAhead || (vector.x === 0 && !sameColumn) || (vector.y === 0 && !sameRow)) return false;

        const startX = tank.x + (vector.x * tank.w) / 2;
        const startY = tank.y + (vector.y * tank.h) / 2;
        const endX = target.x + target.w / 2;
        const endY = target.y + target.h / 2;

        for (const wall of walls.value) {
            if (wall.kind === 'steel' && segmentHitsRect(startX, startY, endX, endY, wall)) return false;
        }
        return true;
    }

    function chooseEnemyDirection(enemy: Tank, now: number): Direction {
        const baseTarget = { x: base.value.x * TILE + TILE, y: base.value.y * TILE + TILE };
        const playerTarget = { x: player.value.x, y: player.value.y };
        const chasePlayer = player.value.alive && Math.random() < 0.34;
        const target = chasePlayer ? playerTarget : baseTarget;
        const preferred = preferredAxisDirection(enemy, target);

        const candidates = [
            preferred,
            Math.random() < 0.5 ? 'left' : 'right',
            Math.random() < 0.5 ? 'up' : 'down',
            ...dirs,
        ].filter((dir, index, all) => all.indexOf(dir) === index) as Direction[];

        if (now < enemy.stuckUntil) {
            const avoidBacktracking = candidates.filter(dir => dir !== oppositeDir(enemy.dir));
            return avoidBacktracking[Math.floor(Math.random() * avoidBacktracking.length)] ?? preferred;
        }

        for (const dir of candidates) {
            const vector = directionVector(dir);
            if (canMove(enemy, enemy.x + vector.x * TILE * 0.55, enemy.y + vector.y * TILE * 0.55)) return dir;
        }

        return oppositeDir(enemy.dir);
    }

    function updateEnemies(dt: number, now: number) {
        const playerRect = getTankRect(player.value);
        const targetBaseRect = baseRect();

        for (const enemy of enemies.value) {
            if (!enemy.alive) continue;

            if (now >= enemy.nextDecisionAt) {
                enemy.targetDir = chooseEnemyDirection(enemy, now);
                enemy.nextDecisionAt = now + ENEMY_DECISION_INTERVAL + Math.random() * 420;
            }

            enemy.dir = enemy.targetDir;
            const vector = directionVector(enemy.dir);
            const moved = moveTank(enemy, vector.x * enemy.speed * dt, vector.y * enemy.speed * dt);
            if (!moved) {
                enemy.stuckUntil = now + 420;
                enemy.nextDecisionAt = 0;
            }

            const shouldFireAtPlayer = player.value.alive && canShootTarget(enemy, playerRect);
            const shouldFireAtBase = base.value.alive && canShootTarget(enemy, targetBaseRect);
            const pressureShot = Math.random() < 0.006 + wave.value * 0.001;
            if (shouldFireAtPlayer || shouldFireAtBase || pressureShot) fire(enemy, now);
        }
    }

    function hitWall(wall: Wall, bulletIsPlayer: boolean) {
        if (wall.kind === 'steel') return false;
        wall.hp -= bulletIsPlayer ? 1 : 0.75;
        return wall.hp <= 0;
    }

    function damagePlayer(now: number) {
        if (now < player.value.spawnGraceUntil) return;
        lives.value--;

        if (lives.value <= 0) {
            player.value.alive = false;
            gameStatus.value = 'lost';
            message.value = '坦克被击毁，任务失败';
            return;
        }

        player.value = {
            ...createPlayer(),
            spawnGraceUntil: now + 1500,
        };
        bullets.value = bullets.value.filter(
            b => !segmentHitsRect(b.prevX, b.prevY, b.x, b.y, getTankRect(player.value)),
        );
        message.value = `受击！剩余生命 ${lives.value}`;
    }

    function updateBullets(dt: number, now: number) {
        const newBullets: Bullet[] = [];

        for (const bullet of bullets.value) {
            bullet.prevX = bullet.x;
            bullet.prevY = bullet.y;
            bullet.x += bullet.dx * dt;
            bullet.y += bullet.dy * dt;

            if (
                bullet.x < -BULLET_RADIUS ||
                bullet.x > CANVAS_W + BULLET_RADIUS ||
                bullet.y < -BULLET_RADIUS ||
                bullet.y > CANVAS_H + BULLET_RADIUS
            ) {
                continue;
            }

            let hit = false;

            for (let wi = walls.value.length - 1; wi >= 0; wi--) {
                const wall = walls.value[wi];
                if (segmentHitsRect(bullet.prevX, bullet.prevY, bullet.x, bullet.y, wall)) {
                    if (hitWall(wall, bullet.isPlayer)) walls.value.splice(wi, 1);
                    hit = true;
                    break;
                }
            }
            if (hit) continue;

            if (base.value.alive && segmentHitsRect(bullet.prevX, bullet.prevY, bullet.x, bullet.y, baseRect())) {
                base.value.alive = false;
                gameStatus.value = 'lost';
                message.value = '基地被摧毁，任务失败';
                return;
            }

            if (bullet.isPlayer) {
                for (const enemy of enemies.value) {
                    if (!enemy.alive) continue;
                    if (segmentHitsRect(bullet.prevX, bullet.prevY, bullet.x, bullet.y, getTankRect(enemy))) {
                        enemy.alive = false;
                        kills.value++;
                        wave.value = Math.floor(kills.value / 5) + 1;
                        score.value += 100 + Math.max(0, wave.value - 1) * 15;
                        message.value = `击毁敌人！第 ${wave.value} 波`;
                        if (score.value > highScore.value) {
                            highScore.value = score.value;
                            localStorage.setItem('tank-high-score', String(highScore.value));
                        }
                        hit = true;
                        break;
                    }
                }
            } else if (
                player.value.alive &&
                segmentHitsRect(bullet.prevX, bullet.prevY, bullet.x, bullet.y, getTankRect(player.value))
            ) {
                damagePlayer(now);
                hit = true;
            }

            if (!hit) newBullets.push(bullet);
        }

        bullets.value = newBullets;
        enemies.value = enemies.value.filter(enemy => enemy.alive || now - enemy.spawnGraceUntil < 2500);
    }

    function updateSpawns(now: number) {
        if (now < nextSpawnTime.value) return;
        if (!spawnOneEnemy(now)) {
            nextSpawnTime.value = now + 650;
        }
    }

    function gameLoop(time: number) {
        if (gameStatus.value !== 'playing') {
            rafId = null;
            return;
        }

        const dt = clamp((time - lastTime) / 1000, 0, 0.033);
        lastTime = time;

        updatePlayer(dt, time);
        updateEnemies(dt, time);
        updateBullets(dt, time);
        updateSpawns(time);

        rafId = requestAnimationFrame(gameLoop);
    }

    function draw(ctx: CanvasRenderingContext2D) {
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        ctx.strokeStyle = 'rgba(255,255,255,0.035)';
        ctx.lineWidth = 1;
        for (let x = 0; x < COLS; x++) {
            for (let y = 0; y < ROWS; y++) {
                ctx.strokeRect(x * TILE, y * TILE, TILE, TILE);
            }
        }

        ctx.fillStyle = 'rgba(255,255,255,0.13)';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(`击毁 ${kills.value}  波数 ${wave.value}  生命 ${lives.value}`, CANVAS_W / 2, CANVAS_H - 8);

        for (const wall of walls.value) {
            if (wall.kind === 'steel') {
                ctx.fillStyle = '#65758b';
                ctx.strokeStyle = '#94a3b8';
            } else {
                ctx.fillStyle = wall.hp >= 1 ? '#9a5a32' : '#7c3f28';
                ctx.strokeStyle = '#c08457';
            }
            ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
            ctx.strokeRect(wall.x + 0.5, wall.y + 0.5, wall.w - 1, wall.h - 1);
        }

        if (base.value.alive) {
            const br = baseRect();
            ctx.fillStyle = '#facc15';
            ctx.fillRect(br.x, br.y, br.w, br.h);
            ctx.fillStyle = '#dc2626';
            ctx.font = 'bold 24px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('★', br.x + br.w / 2, br.y + br.h / 2 + 1);
        }

        if (player.value.alive) {
            const blinking =
                player.value.spawnGraceUntil > performance.now() && Math.floor(performance.now() / 120) % 2 === 0;
            if (!blinking) drawTank(ctx, player.value, '#4fc3f7', '#0284c7');
        }

        for (const enemy of enemies.value) {
            if (enemy.alive) drawTank(ctx, enemy, '#ef5350', '#b91c1c');
        }

        for (const bullet of bullets.value) {
            ctx.beginPath();
            ctx.arc(bullet.x, bullet.y, BULLET_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = bullet.isPlayer ? '#7dd3fc' : '#fb7185';
            ctx.fill();
        }

        if (gameStatus.value === 'playing' && message.value) {
            ctx.fillStyle = 'rgba(15,23,42,0.72)';
            ctx.fillRect(165, 8, 270, 28);
            ctx.fillStyle = '#e5e7eb';
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(message.value, CANVAS_W / 2, 22);
        }
    }

    function drawTank(ctx: CanvasRenderingContext2D, tank: Tank, color: string, darkColor: string) {
        ctx.save();
        ctx.translate(tank.x, tank.y);

        const rot = { up: 0, down: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 };
        ctx.rotate(rot[tank.dir]);

        ctx.fillStyle = darkColor;
        ctx.fillRect(-tank.w / 2, -tank.h / 2, tank.w, tank.h);

        ctx.fillStyle = color;
        ctx.fillRect(-tank.w / 2 + 3, -tank.h / 2 + 3, tank.w - 6, tank.h - 6);

        ctx.fillStyle = '#e5e7eb';
        ctx.fillRect(-4, -tank.h / 2 - 2, 8, 6);
        ctx.fillRect(-4, tank.h / 2 - 4, 8, 6);

        ctx.fillStyle = '#374151';
        ctx.fillRect(-9, -tank.h / 2 - 1, 18, 3);

        ctx.fillStyle = darkColor;
        ctx.fillRect(-2, -tank.h / 2 - 8, 4, 15);

        ctx.restore();
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter') {
            if (gameStatus.value === 'idle' || gameStatus.value === 'lost') {
                e.preventDefault();
                startGame();
                return;
            }
        }
        keys.value.add(e.key);
        if (e.key === ' ') e.preventDefault();
    }

    function handleKeyup(e: KeyboardEvent) {
        keys.value.delete(e.key);
    }

    onUnmounted(() => {
        if (rafId) cancelAnimationFrame(rafId);
    });

    return {
        gameStatus,
        score,
        highScore,
        kills,
        wave,
        lives,
        message,
        width: CANVAS_W,
        height: CANVAS_H,
        startGame,
        handleKeydown,
        handleKeyup,
        draw,
    };
}
