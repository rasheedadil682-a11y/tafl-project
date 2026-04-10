/**
 * App Controller Module
 * Connects UI with CFGParser, DerivationEngine, and ParseTreeRenderer.
 */

// Global state
let treeRenderer = null;
let currentGrammar = null;
let currentTree = null;

// Preset data
const PRESETS = {
    anbn: {
        grammar: `S -> aSb | ab`,
        string: 'aabb',
        start: 'S',
        name: 'aⁿbⁿ'
    },
    simpleab: {
        grammar: `S -> AB\nA -> aA | a\nB -> bB | b`,
        string: 'aab',
        start: 'S',
        name: 'Simple AB'
    },
    arithmetic: {
        grammar: `E -> E+T | T\nT -> T*F | F\nF -> (E) | i`,
        string: 'i+i*i',
        start: 'E',
        name: 'Arithmetic'
    },
    palindrome: {
        grammar: `S -> aSa | bSb | a | b | ε`,
        string: 'aba',
        start: 'S',
        name: 'Palindrome'
    }
};

// Initialize renderer
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('parse-tree-canvas');
    treeRenderer = new ParseTreeRenderer(canvas);
});

/**
 * Load a preset into the input fields.
 */
function loadPreset(presetId, element) {
    const preset = PRESETS[presetId];
    if (!preset) return;

    // Update active state on pills
    document.querySelectorAll('.preset-pill').forEach(p => p.classList.remove('active'));
    if (element) element.classList.add('active');

    // Fill inputs
    document.getElementById('grammar-input').value = preset.grammar;
    document.getElementById('string-input').value = preset.string;
    document.getElementById('start-symbol').value = '';

    showStatus(`Loaded preset: "${preset.name}". Click Generate to see derivations.`, 'success');

    // Smooth scroll to input
    document.getElementById('input-section').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * Main derivation handler.
 */
function handleDerive() {
    hideStatus();

    const grammarText = document.getElementById('grammar-input').value.trim();
    const targetString = document.getElementById('string-input').value.trim();
    const startSymbolInput = document.getElementById('start-symbol').value.trim();

    // Validate inputs
    if (!grammarText) {
        showStatus('Please enter grammar production rules.', 'error');
        return;
    }
    if (targetString === '') {
        showStatus('Please enter a target string to derive. Use ε for empty string.', 'warning');
        return;
    }

    try {
        // Parse grammar
        const grammar = CFGParser.parse(grammarText, startSymbolInput);
        currentGrammar = grammar;

        // Display parsed grammar
        displayGrammar(grammar);

        // Handle epsilon target
        const actualTarget = (targetString === 'ε' || targetString.toLowerCase() === 'epsilon') ? '' : targetString;

        // Find derivations
        const engine = new DerivationEngine(grammar);

        const leftResult = engine.findLeftmostDerivation(actualTarget);
        const rightResult = engine.findRightmostDerivation(actualTarget);

        // Display results
        displayDerivation('leftmost-derivation', leftResult, 'leftmost');
        displayDerivation('rightmost-derivation', rightResult, 'rightmost');

        // Render parse tree (from leftmost if available, otherwise rightmost)
        const treeResult = leftResult || rightResult;
        if (treeResult && treeResult.tree) {
            currentTree = treeResult.tree;
            treeRenderer.render(currentTree);
        }

        // Show results section
        document.getElementById('results-section').classList.remove('hidden');

        if (!leftResult && !rightResult) {
            showStatus(`Could not derive "${targetString}" from the grammar. The string may not be in the language, or the derivation tree is too deep.`, 'warning');
        } else {
            showStatus(`Derivation found for "${targetString}" successfully!`, 'success');
        }

        // Scroll to results
        document.getElementById('results-section').scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (e) {
        showStatus(e.message, 'error');
        console.error(e);
    }
}

/**
 * Display the parsed grammar.
 */
function displayGrammar(grammar) {
    const container = document.getElementById('grammar-display');
    let html = '';
    let ruleNum = 1;

    // Group rules by LHS
    const grouped = {};
    for (const rule of grammar.rules) {
        if (!grouped[rule.lhs]) grouped[rule.lhs] = [];
        grouped[rule.lhs].push(rule);
    }

    for (const [lhs, rules] of Object.entries(grouped)) {
        const alternatives = rules.map(r => {
            return r.rhs.map(s => {
                if (s.type === 'nonterminal') return `<span class="non-terminal">${CFGParser.escapeHTML(s.value)}</span>`;
                if (s.type === 'epsilon') return `<span class="epsilon">ε</span>`;
                return `<span class="terminal">${CFGParser.escapeHTML(s.value)}</span>`;
            }).join('');
        }).join('<span class="separator">|</span>');

        html += `<div class="grammar-rule">
            <span class="rule-number">${ruleNum}.</span>
            <span class="non-terminal">${CFGParser.escapeHTML(lhs)}</span>
            <span class="arrow">→</span>
            ${alternatives}
        </div>`;
        ruleNum++;
    }

    // Add summary info
    html += `<div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,140,50,0.08);">
        <span style="font-size: 0.75rem; color: var(--text-dim);">
            Non-terminals: {${[...grammar.nonTerminals].join(', ')}} &nbsp;|&nbsp;
            Terminals: {${[...grammar.terminals].join(', ')}} &nbsp;|&nbsp;
            Start: ${grammar.startSymbol}
        </span>
    </div>`;

    container.innerHTML = html;
}

/**
 * Display a derivation sequence.
 */
function displayDerivation(containerId, result, mode) {
    const container = document.getElementById(containerId);

    if (!result) {
        container.innerHTML = `<div class="no-derivation">No ${mode} derivation found for this string.</div>`;
        return;
    }

    let html = '';
    result.steps.forEach((step, index) => {
        const formHTML = step.form.map((s, sIdx) => {
            const cls = s.type === 'nonterminal' ? 'nt' : (s.type === 'epsilon' ? 'nt' : 't');
            return `<span class="${cls}">${CFGParser.escapeHTML(s.value)}</span>`;
        }).join('');

        const arrow = index === 0 ? '' : '<span class="step-arrow">⇒</span>';
        const ruleInfo = step.rule ? `<span class="step-rule">[${CFGParser.escapeHTML(step.rule)}]</span>` : '<span class="step-rule">[Start]</span>';

        html += `<div class="derivation-step" style="animation-delay: ${index * 0.06}s">
            <span class="step-number">Step ${index}</span>
            ${arrow}
            <div class="step-content">${formHTML} ${ruleInfo}</div>
        </div>`;
    });

    container.innerHTML = html;
}

/**
 * Switch derivation tab.
 */
function switchTab(tabId) {
    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabId}`);
    });
}

/**
 * Clear all inputs and results.
 */
function clearAll() {
    document.getElementById('grammar-input').value = '';
    document.getElementById('string-input').value = '';
    document.getElementById('start-symbol').value = '';
    document.getElementById('results-section').classList.add('hidden');
    document.querySelectorAll('.preset-pill').forEach(p => p.classList.remove('active'));
    hideStatus();
    currentGrammar = null;
    currentTree = null;
}

/**
 * Show status bar.
 */
function showStatus(message, type) {
    const bar = document.getElementById('status-bar');
    const icon = document.getElementById('status-icon');
    const msg = document.getElementById('status-message');

    bar.className = `status-bar ${type}`;
    bar.classList.remove('hidden');

    if (type === 'error') icon.textContent = '✖';
    else if (type === 'warning') icon.textContent = '⚠';
    else icon.textContent = '✔';

    msg.textContent = message;
}

function hideStatus() {
    document.getElementById('status-bar').classList.add('hidden');
}

// Parse tree controls
function zoomIn() {
    if (treeRenderer) treeRenderer.zoomIn();
}

function zoomOut() {
    if (treeRenderer) treeRenderer.zoomOut();
}

function resetZoom() {
    if (treeRenderer) treeRenderer.resetZoom();
}

function downloadTree() {
    if (treeRenderer) treeRenderer.downloadPNG();
}
