/**
 * CFG Parser Module
 * Parses raw grammar text into a structured grammar object.
 */

class CFGParser {
    /**
     * Parse raw grammar text into a structured grammar object.
     * Format: "S -> aB | bA" (one rule per line)
     * @param {string} text - Raw grammar text
     * @returns {{ rules: Array, nonTerminals: Set, terminals: Set, startSymbol: string }}
     */
    static parse(text, startSymbolOverride) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('//'));
        
        if (lines.length === 0) {
            throw new Error('No grammar rules provided.');
        }

        const rules = [];
        const nonTerminals = new Set();
        const terminals = new Set();
        let startSymbol = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Match "A -> ..." or "A → ..." or "A ::= ..."
            const match = line.match(/^([A-Z][A-Z0-9_']*)\s*(?:->|→|::=)\s*(.+)$/);
            if (!match) {
                throw new Error(`Invalid rule on line ${i + 1}: "${line}". Expected format: A -> aB | bA`);
            }

            const lhs = match[1];
            const rhsText = match[2];

            nonTerminals.add(lhs);
            if (startSymbol === null) {
                startSymbol = lhs;
            }

            // Split alternatives by "|"
            const alternatives = rhsText.split('|').map(a => a.trim());

            for (const alt of alternatives) {
                if (alt.length === 0) {
                    throw new Error(`Empty alternative in rule for "${lhs}" on line ${i + 1}.`);
                }

                const symbols = CFGParser._tokenize(alt, nonTerminals);
                rules.push({ lhs, rhs: symbols, original: `${lhs} → ${alt}` });
            }
        }

        // Second pass: categorize symbols now that we know all non-terminals
        for (const rule of rules) {
            rule.rhs = CFGParser._categorizeSymbols(rule.rhs, nonTerminals);
            for (const sym of rule.rhs) {
                if (sym.type === 'terminal') {
                    terminals.add(sym.value);
                }
            }
        }

        if (startSymbolOverride && startSymbolOverride.trim()) {
            const s = startSymbolOverride.trim();
            if (!nonTerminals.has(s)) {
                throw new Error(`Start symbol "${s}" is not defined in the grammar.`);
            }
            startSymbol = s;
        }

        return { rules, nonTerminals, terminals, startSymbol };
    }

    /**
     * Tokenize an RHS string into symbols.
     * Multi-character non-terminals (uppercase start) are supported.
     */
    static _tokenize(rhsStr, knownNonTerminals) {
        const tokens = [];
        const str = rhsStr.trim();

        // Handle epsilon
        if (str === 'ε' || str.toLowerCase() === 'epsilon' || str === 'λ') {
            tokens.push({ value: 'ε', type: 'epsilon' });
            return tokens;
        }

        let i = 0;
        while (i < str.length) {
            // Skip whitespace
            if (str[i] === ' ') {
                i++;
                continue;
            }

            // Check for multi-char non-terminal (uppercase start)
            if (str[i] >= 'A' && str[i] <= 'Z') {
                let nt = str[i];
                i++;
                // Collect trailing uppercase letters, digits, underscores, or primes for multi-char NTs
                while (i < str.length && (str[i] === "'" || str[i] === '_' || (str[i] >= '0' && str[i] <= '9') || (str[i] >= 'A' && str[i] <= 'Z'))) {
                    // Only continue multi-char if it doesn't form a standalone known NT
                    // Greedy approach: collect as many as possible
                    nt += str[i];
                    i++;
                }
                tokens.push({ value: nt, type: 'nonterminal_candidate' });
            } else {
                // Terminal
                tokens.push({ value: str[i], type: 'terminal' });
                i++;
            }
        }

        return tokens;
    }

    /**
     * Categorize symbol candidates now that we know all non-terminals.
     * Multi-char candidates are checked against known non-terminals; 
     * if unknown, treat each character individually.
     */
    static _categorizeSymbols(symbols, nonTerminals) {
        const result = [];

        for (const sym of symbols) {
            if (sym.type === 'epsilon' || sym.type === 'terminal') {
                result.push(sym);
            } else if (sym.type === 'nonterminal_candidate') {
                if (nonTerminals.has(sym.value)) {
                    result.push({ value: sym.value, type: 'nonterminal' });
                } else {
                    // Try to split: e.g., "AB" might be two non-terminals A and B
                    const split = CFGParser._splitCandidate(sym.value, nonTerminals);
                    result.push(...split);
                }
            }
        }

        return result;
    }

    /**
     * Split a candidate string into known non-terminals and terminals.
     */
    static _splitCandidate(str, nonTerminals) {
        const result = [];
        let i = 0;

        while (i < str.length) {
            // Try longest match first
            let matched = false;
            for (let len = str.length - i; len >= 1; len--) {
                const sub = str.substring(i, i + len);
                if (nonTerminals.has(sub)) {
                    result.push({ value: sub, type: 'nonterminal' });
                    i += len;
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                // Single character — if uppercase, still non-terminal (might be forward reference)
                if (str[i] >= 'A' && str[i] <= 'Z') {
                    result.push({ value: str[i], type: 'nonterminal' });
                } else {
                    result.push({ value: str[i], type: 'terminal' });
                }
                i++;
            }
        }

        return result;
    }

    /**
     * Format a symbols array back to a readable string.
     */
    static symbolsToString(symbols) {
        return symbols.map(s => s.value).join('');
    }

    /**
     * Format a symbols array to HTML with color coding.
     */
    static symbolsToHTML(symbols, highlightIndex) {
        return symbols.map((s, idx) => {
            let cls = s.type === 'nonterminal' ? 'nt' : (s.type === 'epsilon' ? 'nt' : 't');
            let extra = '';
            if (highlightIndex !== undefined && idx === highlightIndex) {
                extra = ' highlight';
            }
            return `<span class="${cls}${extra}">${CFGParser.escapeHTML(s.value)}</span>`;
        }).join('');
    }

    static escapeHTML(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CFGParser;
}
