(() => {
    const scriptPath =
        typeof window.EJS_pathtodata === 'string'
            ? window.EJS_pathtodata
            : new URL('./', document.currentScript.src).href;
    const scripts = [
        'emulator.js',
        'nipplejs.js',
        'shaders.js',
        'storage.js',
        'GameManager.js',
        'socket.io.min.js',
        'compression.js',
    ];

    function loadScript(file) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = scriptPath + 'src/' + file;
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load EmulatorJS source: ' + file));
            document.body.appendChild(script);
        });
    }

    function loadStyle(file) {
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = scriptPath + file;
            link.onload = resolve;
            link.onerror = () => reject(new Error('Failed to load EmulatorJS style: ' + file));
            document.head.appendChild(link);
        });
    }

    (async () => {
        for (const file of scripts) {
            await loadScript(file);
        }
        await loadStyle('emulator.css');

        const config = {};
        for (const key in window) {
            if (key.startsWith('EJS_')) {
                config[key.replace('EJS_', '')] = window[key];
            }
        }
        config.system = window.EJS_core;
        config.parent = window.EJS_player;
        window.EJS_emulator = new EmulatorJS(config);
    })();
})();
