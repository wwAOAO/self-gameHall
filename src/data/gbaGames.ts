export interface GbaGame {
    id: string;
    name: string;
    desc: string;
    tag: string;
    format: string;
    romPath?: string;
    fileName?: string;
    accent: string;
}

export const gbaGames: GbaGame[] = [
    {
        id: 'local',
        name: '本地卡带',
        desc: '从电脑选择你拥有授权的 .gba 文件，临时载入游玩。',
        tag: '导入',
        format: 'GBA ROM',
        accent: 'from-violet-300 to-cyan-400',
    },
    {
        id: 'sample',
        name: '预留卡带位',
        desc: '把 ROM 放到 public/roms/gba/sample.gba 后，这张卡片会直接加载它。',
        tag: '预留',
        format: 'Game Boy Advance',
        romPath: '/roms/gba/sample.gba',
        accent: 'from-rose-300 to-amber-400',
    },
];

export async function loadGbaGames() {
    try {
        const response = await fetch('/roms/gba/manifest.json', { cache: 'no-store' });
        if (!response.ok) return gbaGames;
        const manifestGames = (await response.json()) as GbaGame[];
        const configuredIds = new Set(gbaGames.map(game => game.id));
        const configuredPaths = new Set(gbaGames.map(game => game.romPath).filter(Boolean));
        return [
            ...gbaGames,
            ...manifestGames.filter(game => !configuredIds.has(game.id) && !configuredPaths.has(game.romPath)),
        ];
    } catch {
        return gbaGames;
    }
}

export function findGbaGame(id: string | string[] | undefined) {
    const normalizedId = Array.isArray(id) ? id[0] : id;
    return gbaGames.find(game => game.id === normalizedId) ?? gbaGames[0];
}

export async function loadGbaGame(id: string | string[] | undefined) {
    const normalizedId = Array.isArray(id) ? id[0] : id;
    const games = await loadGbaGames();
    return games.find(game => game.id === normalizedId) ?? games[0] ?? gbaGames[0];
}
