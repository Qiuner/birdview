import { validateRuleHistory } from './constraint-rule-history.mjs';
export const ruleCategories = [
    { id: 'lifecycle', name: '生命周期' },
    { id: 'interfaces', name: '接口与数据' },
    { id: 'configuration', name: '配置与扩展' },
    { id: 'security', name: '安全边界' },
    { id: 'testing', name: '测试与验证' },
    { id: 'delivery', name: '协作与交付' },
];
// Same role meanings and dark/light tokens as architecture.js / architecture.html.
export const constraintRoles = {
    frontend: { name: '前端', dark: ['#a8d7f3', '#273744', '#557f9e'], light: ['#2169a8', '#e8f3ff', '#3781c5'] },
    backend: { name: '后端', dark: ['#a1e2ce', '#203b37', '#497e70'], light: ['#087a58', '#dff5eb', '#129870'] },
    cache: { name: '缓存', dark: ['#8bddea', '#193c43', '#448e9d'], light: ['#087e93', '#dff6fa', '#1596ad'] },
    database: { name: '数据存储', dark: ['#d1b9f4', '#342d46', '#806aab'], light: ['#763bc8', '#eee6ff', '#8b51de'] },
    queue: { name: '任务与队列', dark: ['#ead096', '#3b3324', '#897243'], light: ['#b06b08', '#fff2da', '#d18a17'] },
    security: { name: '安全', dark: ['#edb7cb', '#3e2c34', '#916276'], light: ['#bf3058', '#ffebf0', '#df4a72'] },
    generic: { name: '通用', dark: ['#c0d6df', '#303b40', '#718892'], light: ['#526780', '#edf0f5', '#7b8ba4'] },
};
const categoryNamesEn = { lifecycle: 'Lifecycle', interfaces: 'Interfaces and data', configuration: 'Configuration and extension',
    security: 'Security boundaries', testing: 'Testing and verification', delivery: 'Collaboration and delivery' };
const roleNamesEn = { frontend: 'Frontend', backend: 'Backend', cache: 'Cache', database: 'Data storage',
    queue: 'Jobs and queues', security: 'Security', generic: 'Generic' };
// Generated text follows the architecture map language: Chinese for zh*, English otherwise
// (references/bilingual.md: other languages use English controls with authored project text).
export function buildRuleGraph(catalog, language = 'zh') {
    const zh = language.toLowerCase().startsWith('zh');
    const t = (chinese, english) => zh ? chinese : english;
    const roleName = (role) => zh ? constraintRoles[role].name : roleNamesEn[role];
    const categoryName = (category) => zh ? category.name : (categoryNamesEn[category.id] ?? category.name);
    const sep = t('：', ': ');
    if (!Array.isArray(catalog.rules) || !catalog.rules.length || !catalog.ruleReview?.scope) {
        throw new Error('Rule graph requires reviewed rules and ruleReview.scope. Collecting sources is not rule review. Review the collected sources before rendering; original text remains available in By directory.');
    }
    const nodes = [], documents = {};
    const ids = new Set();
    const categories = ruleCategories.filter(category => catalog.rules.some(rule => rule.category === category.id));
    const counts = Object.fromEntries(categories.map(category => [category.id, catalog.rules.filter(rule => rule.category === category.id).length]));
    for (const rule of catalog.rules) {
        if (!Object.hasOwn(constraintRoles, rule.targetRole || 'generic'))
            throw new Error(`Unknown targetRole: ${rule.id}`);
        if (rule.targetRole && rule.targetRole !== 'generic' && !rule.roleReason)
            throw new Error(`Role mapping requires evidence: ${rule.id}`);
    }
    const groupRole = (rules) => {
        const roles = new Set(rules.map(rule => rule.targetRole || 'generic'));
        return roles.size === 1 ? [...roles][0] : 'generic';
    };
    const add = (id, parent, title, desc, body, role, label) => {
        if (!/^[a-z][a-z0-9-]*$/.test(id) || ids.has(id))
            throw new Error(`Invalid or duplicate rule node id: ${id}`);
        ids.add(id);
        nodes.push({ id, parent, title, desc, role, label, kind: 'group' });
        documents[id] = { body };
    };
    const used = new Set(catalog.rules.map(rule => rule.sourcePath));
    const coverage = t(`已整理 ${catalog.rules.length} 条规则，来自 ${used.size} 份来源。${catalog.ruleReview.scope}。其他来源尚未逐条提炼；这不是整个仓库的合规审计。`, `${catalog.rules.length} rules reviewed from ${used.size} sources. ${catalog.ruleReview.scope}. Other sources were not reviewed rule by rule; this is not a compliance audit of the whole repository.`);
    add('project', null, catalog.project.name, coverage, t(`# ${catalog.project.name}\n\n${coverage}\n\n## 怎么阅读\n\n单击展开分类，选择规则阅读详情。编号区分主题；颜色与架构图一致，表示适用角色，不代表通过或失败。跨角色或未明确归属用通用色，混合分组也用通用色。实现核验尚未完成。\n\n## 本轮提炼来源\n\n${[...used].map(file => `- ${file}`).join('\n')}\n\n## 覆盖边界\n\n来源扫描包含 ${catalog.sources.length} 份文件；${catalog.coverage.unresolved.length} 条引用仍需核对。\n\n快照：${catalog.project.revision}`, `# ${catalog.project.name}\n\n${coverage}\n\n## How to read\n\nClick a category to expand it and select a rule to read its details. Numbers separate topics; colours match the architecture map and show the applicable role, not pass or fail. Cross-role or unassigned rules use the generic colour, and so do mixed groups. Implementation has not been verified.\n\n## Sources reviewed this round\n\n${[...used].map(file => `- ${file}`).join('\n')}\n\n## Coverage boundary\n\nThe source scan covers ${catalog.sources.length} files; ${catalog.coverage.unresolved.length} references still need checking.\n\nSnapshot: ${catalog.project.revision}`), 'generic', t(`${catalog.rules.length} 条规则 · ${categories.length} 类`, `${catalog.rules.length} rules · ${categories.length} categories`));
    for (const category of categories) {
        const number = String(ruleCategories.indexOf(category) + 1).padStart(2, '0');
        add(`category-${category.id}`, 'project', `${number} ${categoryName(category)}`, t(`${counts[category.id]} 条已提炼规则`, `${counts[category.id]} reviewed rules`), `# ${categoryName(category)}\n\n${catalog.rules.filter(rule => rule.category === category.id).map(rule => `- **${rule.name}**${sep}${rule.condition}`).join('\n')}\n\n${t('编号表示主题，颜色表示适用角色；混合分组为通用色。所有实现结果仍未验证。', 'Numbers show the topic and colours the applicable role; mixed groups use the generic colour. No implementation result has been verified.')}`, groupRole(catalog.rules.filter(rule => rule.category === category.id)), t(`${counts[category.id]} 条规则`, `${counts[category.id]} rules`));
    }
    for (const [index, rule] of catalog.rules.entries()) {
        const category = categories.find(item => item.id === rule.category);
        const source = catalog.sources.find(item => item.path === rule.sourcePath);
        if (!category || !source || !rule.name || !rule.explanation || !rule.condition || !rule.verification
            || !Number.isInteger(rule.line) || !Number.isInteger(rule.endLine) || rule.line < 1 || rule.endLine < rule.line
            || rule.endLine > source.text.split(/\r?\n/).length
            || !['applicable', 'conditional', 'superseded', 'conflict', 'uncertain'].includes(rule.applicability))
            throw new Error(`Invalid reviewed rule: ${rule.id}`);
        const quote = source.text.split(/\r?\n/).slice(rule.line - 1, rule.endLine).join('\n');
        const states = zh
            ? { applicable: '适用', conditional: '按条件适用', superseded: '已被替代', conflict: '存在冲突', uncertain: '适用性待确认' }
            : { applicable: 'Applicable', conditional: 'Conditional', superseded: 'Superseded', conflict: 'In conflict', uncertain: 'Applicability to confirm' };
        const role = rule.targetRole || 'generic';
        const history = rule.history?.status === 'tracked' && validateRuleHistory(rule.history, rule, catalog.project.revision) ? rule.history : undefined;
        const version = history ? `v${history.version}` : t('版本未追踪', 'version not tracked');
        const label = `R${String(index + 1).padStart(3, '0')} · ${version} · ${roleName(role)}`;
        let parent = `category-${category.id}`;
        if (rule.topic) {
            if (!/^[a-z][a-z0-9-]*$/.test(rule.topic.id) || !rule.topic.name)
                throw new Error('Invalid topic');
            parent = `topic-${category.id}-${rule.topic.id}`;
            if (!ids.has(parent)) {
                const grouped = catalog.rules.filter(item => item.category === rule.category && item.topic?.id === rule.topic.id);
                add(parent, `category-${category.id}`, rule.topic.name, t(`${grouped.length} 条规则`, `${grouped.length} rules`), `# ${rule.topic.name}\n\n${grouped.map(item => `- **${item.name}**${sep}${item.condition}`).join('\n')}`, groupRole(grouped), t(`${grouped.length} 条规则`, `${grouped.length} rules`));
            }
        }
        add(rule.id, parent, rule.name, rule.explanation, t(`# ${rule.name}\n\n## 什么时候用\n\n${rule.condition}\n\n适用性：${states[rule.applicability]}\n\n适用角色：${roleName(role)}。${rule.roleReason || '跨领域规则或尚无单一角色归属；不推断具体模块所有权。'}\n\n## 具体要求\n\n${rule.explanation}\n\n## 怎么检查\n\n${rule.verification}\n\n**当前核验：未执行实现核验。**\n\n## 来源依据\n\n\`${rule.sourcePath}:${rule.line}-${rule.endLine}\`\n\n${quote.split('\n').map(line => `> ${line}`).join('\n')}\n\n来源文件最后修改：${source.history?.lastEdited || '未知'}。文件历史不作为规则版本。`, `# ${rule.name}\n\n## When it applies\n\n${rule.condition}\n\nApplicability: ${states[rule.applicability]}\n\nApplicable role: ${roleName(role)}. ${rule.roleReason || 'Cross-cutting rule or no single owning role yet; module ownership is not inferred.'}\n\n## What it requires\n\n${rule.explanation}\n\n## How to check\n\n${rule.verification}\n\n**Current verification: implementation not verified.**\n\n## Source evidence\n\n\`${rule.sourcePath}:${rule.line}-${rule.endLine}\`\n\n${quote.split('\n').map(line => `> ${line}`).join('\n')}\n\nSource file last edited: ${source.history?.lastEdited || 'unknown'}. File history is not a rule version.`), role, label);
        const node = nodes.at(-1);
        Object.assign(node, { kind: 'rule', modules: rule.modules || [], ordinal: index + 1, applicability: rule.applicability });
        // Version belongs to this rule's quoted source range, never to its source file as a whole.
        if (history)
            Object.assign(node, { version: history.version, lastEdited: history.lastEdited });
        documents[rule.id].body += history
            ? t(`\n\n## 规则原文版本\n\nv${history.version} · ${history.lastEdited}\n\n按 Git 原文行段历史计数，不是语义版本，也不是提炼解释的修订次数。移动、格式修改或共同段落可能影响计数。\n\n快照：${history.snapshot}\n\n`, `\n\n## Source text version\n\nv${history.version} · ${history.lastEdited}\n\nCounted from the Git history of the quoted line range; not a semantic version and not the number of revisions of the reviewed explanation. Moves, reformatting or shared paragraphs can affect the count.\n\nSnapshot: ${history.snapshot}\n\n`) + history.commits.map(item => `- ${item.commit} · ${item.date}`).join('\n')
            : t('\n\n## 规则原文版本\n\n版本未追踪。尚无完整且匹配当前快照的规则行段历史。', '\n\n## Source text version\n\nVersion not tracked. There is no complete line-range history matching the current snapshot yet.');
    }
    const directoryNodes = [{ ...nodes[0] }];
    const directoryIds = new Map([['.', 'directory-root']]);
    const directoryNode = (directory) => {
        if (directoryIds.has(directory) && directory !== '.')
            return directoryIds.get(directory);
        const id = directoryIds.get(directory) || `directory-${directoryIds.size}`;
        if (directoryNodes.some(node => node.id === id))
            return id;
        directoryIds.set(directory, id);
        const parentPath = directory.includes('/') ? directory.slice(0, directory.lastIndexOf('/')) : '.';
        const parent = directory === '.' ? 'project' : directoryNode(parentPath);
        const local = catalog.sources.filter(source => (source.path.includes('/') ? source.path.slice(0, source.path.lastIndexOf('/')) : '.') === directory);
        const inherited = catalog.sources.filter(source => source.kind === 'instruction' && source.scope != null
            && source.scope !== directory && (source.scope === '.' || directory.startsWith(source.scope + '/')));
        const describe = (sources) => sources.map(source => {
            const rules = catalog.rules.filter(rule => rule.sourcePath === source.path);
            return `- ${source.path} · ${t(`${rules.length} 条已整理规则`, `${rules.length} reviewed rules`)}\n${rules.map(rule => zh ? `  ${rule.name}：${rule.condition}（${rule.applicability}）` : `  ${rule.name}: ${rule.condition} (${rule.applicability})`).join('\n')}`;
        }).join('\n') || t('无已采集来源 / No collected sources', 'No collected sources');
        directoryNodes.push({ id, parent, title: directory === '.' ? t('/ · 项目根目录', '/ · project root') : directory.split('/').at(-1), kind: 'group', role: 'generic', label: directory, desc: t('目录来源与上级关系；不自动判定覆盖或合规。', 'Directory sources and ancestors; coverage and compliance are not inferred automatically.') });
        documents[id] = { body: zh
                ? `# ${directory}\n\n## 本目录来源 / Local sources\n\n${describe(local)}\n\n## 上级指令来源 / Ancestor instructions\n\n${describe(inherited)}\n\n## 生效边界 / Applicability boundary\n\n上级指令是继承审查的候选依据，不代表其中每条规则都无条件生效。结合当前工具、任务条件、显式覆盖和冲突审查判断。目录包含关系本身不证明覆盖。Skills 与引用文档按调用和引用关系判断，不以存放目录推断作用域。仅展示已采集来源；没有来源不等于没有约束。\n\n${coverage}`
                : `# ${directory}\n\n## Local sources\n\n${describe(local)}\n\n## Ancestor instructions\n\n${describe(inherited)}\n\n## Applicability boundary\n\nAncestor instructions are candidates for inherited review, not proof that every rule in them applies unconditionally. Judge with the current tools, task conditions, explicit overrides and conflict review. Directory containment alone does not prove coverage. Skills and referenced documents follow invocation and reference relationships, not their storage directory. Only collected sources are shown; no source does not mean no constraint.\n\n${coverage}` };
        return id;
    };
    for (const [index, source] of catalog.sources.entries()) {
        const directory = source.path.includes('/') ? source.path.slice(0, source.path.lastIndexOf('/')) : '.';
        const id = `directory-source-${index}`;
        const rules = nodes.filter(node => node.kind === 'rule' && catalog.rules[node.ordinal - 1]?.sourcePath === source.path);
        directoryNodes.push({ id, parent: directoryNode(directory), title: source.path.split('/').at(-1), kind: 'group', role: 'generic', label: `${t(`${rules.length} 条规则`, `${rules.length} rules`)} · ${source.kind || 'reference'}`, desc: source.path });
        documents[id] = { body: zh
                ? `# ${source.path}\n\n类型：${source.kind || 'reference'}\n\n记录作用域：${source.scope ?? '按任务与引用判断'}\n\n来源审查状态：${source.applicability || 'unreviewed'}\n\n${rules.length ? rules.map(rule => `- ${rule.title}`).join('\n') : '尚未提炼规则；不代表不存在约束。'}\n\n## 原文 / Source\n\n${source.text.split('\n').map(line => '> ' + line).join('\n')}`
                : `# ${source.path}\n\nType: ${source.kind || 'reference'}\n\nRecorded scope: ${source.scope ?? 'decided by task and references'}\n\nSource review status: ${source.applicability || 'unreviewed'}\n\n${rules.length ? rules.map(rule => `- ${rule.title}`).join('\n') : 'No rules reviewed yet; this does not mean there are no constraints.'}\n\n## Source\n\n${source.text.split('\n').map(line => '> ' + line).join('\n')}` };
        directoryNodes.push(...rules.map(rule => ({ ...rule, parent: id })));
    }
    return { schema: 'birdview.constraint-view/v1', mode: 'rules', title: catalog.project.name,
        revision: catalog.project.revision, scope: coverage, roles: constraintRoles, nodes, directoryNodes, documents };
}
