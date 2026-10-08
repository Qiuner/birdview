import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from './main-module.mjs';
import { buildRuleGraph } from './constraint-rule-view.mjs';
const assets = fileURLToPath(new URL('../assets/', import.meta.url));
export function buildConstraintGraph(catalog) {
    if (catalog.schema !== 'birdview.constraint-catalog/v1' || !catalog.project?.name || !Array.isArray(catalog.sources)
        || !catalog.coverage || !Array.isArray(catalog.references))
        throw new Error('Invalid constraint catalog');
    return buildRuleGraph(catalog);
}
export function renderConstraintCatalog(catalog, _shell) {
    const payload = buildConstraintGraph(catalog);
    // The optional shell argument is retained for callers; rendering always uses Birdview assets.
    const read = (file) => fs.readFileSync(path.join(assets, file), 'utf8').replace(/\r\n?/g, '\n');
    return read('constraint-page.html')
        .replace('<head>', () => '<head><!--\n' + fs.readFileSync(new URL('../LICENSE', import.meta.url), 'utf8') + '\n-->')
        .replace('/* CONSTRAINT_DATA */', () => JSON.stringify(payload).replace(/</g, '\\u003c'))
        .replace('/* CONSTRAINT_CSS */', () => read('constraint-canvas.css'))
        .replace('/* CONSTRAINT_JS */', () => read('constraint-canvas.js'));
}
if (isMainModule(import.meta.url)) {
    const [input, output, ...options] = process.argv.slice(2);
    if (!input || !output)
        throw new Error('Usage: node scripts/render-constraints.mjs catalog.json constraints.html');
    if (options.length)
        throw new Error('No extra options are supported; --sources was removed. Read sources in By directory on the constraint page.');
    const catalog = JSON.parse(fs.readFileSync(input, 'utf8'));
    const html = renderConstraintCatalog(catalog);
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    fs.writeFileSync(output, html);
    console.log(path.resolve(output));
}
