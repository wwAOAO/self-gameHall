export const PNG = class PNG {};

export function readFile(_path: unknown, callback: (error: Error) => void) {
    callback(new Error('Node fs is not available in the browser.'));
}

export function writeFile(_path: unknown, _data: unknown, callback?: (error?: Error) => void) {
    callback?.(new Error('Node fs is not available in the browser.'));
}

export default {
    PNG,
    readFile,
    writeFile,
};
