/**
 * Derivation Engine Module
 * Computes leftmost and rightmost derivations, and builds parse trees.
 *
 * KEY DESIGN: The parse tree is built DURING derivation, not reconstructed after.
 * The tree is the SINGLE SOURCE OF TRUTH — the sentential form at each step is
 * read directly from the tree's leaf nodes. This guarantees:
 *   - The tree is always structurally correct and connected
 *   - Only one non-terminal is expanded at a time
 *   - Parent-child relationships are always valid
 *   - The leaf sequence always matches the current sentential form
 */

class DerivationEngine {
    constructor(grammar) {
        this.grammar = grammar;
        this.maxDepth = 20;      // Maximum derivation depth
        this.maxStates = 100000; // Maximum states to explore
    }

    /**
     * Find a leftmost derivation for the target string.
     * Returns { steps: [...], tree: ParseTreeNode } or null if not found.
     */
    findLeftmostDerivation(target) {
        return this._findDerivation(target, 'leftmost');
    }

    /**
     * Find a rightmost derivation for the target string.
     * Returns { steps: [...], tree: ParseTreeNode } or null if not found.
     */
    findRightmostDerivation(target) {
        return this._findDerivation(target, 'rightmost');
    }

    /**
     * Core derivation search using BFS.
     *
     * At each step we:
     *   1. Find the leftmost/rightmost non-terminal LEAF directly in the tree
     *   2. Expand that single node by attaching children (one production rule)
     *   3. Read the new sentential form FROM the tree's leaves (tree = source of truth)
     *   4. Validate consistency with the target string
     *   5. Continue until all leaves are terminals and match the target
     */
    _findDerivation(target, mode) {
        const { rules, startSymbol } = this.grammar;

        // Initial tree: single root node (the start symbol)
        const startTree = { symbol: startSymbol, type: 'nonterminal', children: null };

        // Read sentential form FROM the tree
        const startForm = this._getSententialForm(startTree);
        const startKey = this._formKey(startForm);

        const visited = new Set();
        visited.add(startKey);

        const queue = [{
            tree: startTree,
            steps: [{ form: startForm, rule: null }],
            depth: 0
        }];

        console.group(`[Derivation Engine] ${mode} derivation for "${target}"`);
        console.log(`Step 0: ${startKey}`);

        let statesExplored = 0;

        while (queue.length > 0 && statesExplored < this.maxStates) {
            const current = queue.shift();
            statesExplored++;

            // Find the non-terminal leaf to expand DIRECTLY IN THE TREE
            const ntLeaf = this._findNTLeaf(current.tree, mode);

            if (!ntLeaf) {
                // No non-terminal leaves — all leaves are terminals (or epsilon).
                // Read the derived terminal string and compare.
                const derived = this._getTerminalString(current.tree);
                if (derived === target) {
                    // SUCCESS — log the derivation path
                    console.log(`✓ Found in ${current.steps.length - 1} steps (${statesExplored} states)`);
                    current.steps.forEach((step, i) => {
                        const leafStr = step.form.map(s => s.value).join('');
                        console.log(`  Step ${i}: ${leafStr || 'ε'} ${step.rule ? `[${step.rule}]` : '[Start]'}`);
                    });
                    // Validate: leaf sequence must equal target
                    const leafSeq = this._getTerminalString(current.tree);
                    console.log(`  Leaf sequence: "${leafSeq}" === "${target}" → ${leafSeq === target ? '✓' : '✗'}`);
                    console.groupEnd();
                    return { steps: current.steps, tree: current.tree };
                }
                continue;
            }

            if (current.depth >= this.maxDepth) continue;

            const ntSymbol = ntLeaf.node.symbol;

            // Try each production rule that matches this non-terminal
            for (const rule of rules) {
                if (rule.lhs !== ntSymbol) continue;

                // 1. Deep clone the entire tree
                const newTree = this._cloneTree(current.tree);

                // 2. Navigate to the SAME leaf node in the clone using path
                const targetNode = this._getNodeByPath(newTree, ntLeaf.path);
                if (!targetNode) continue;

                // 3. Expand: attach children to this single non-terminal node
                if (rule.rhs[0].type === 'epsilon') {
                    targetNode.children = [{
                        symbol: 'ε',
                        type: 'epsilon',
                        children: null
                    }];
                } else {
                    targetNode.children = rule.rhs.map(s => ({
                        symbol: s.value,
                        type: s.type,
                        children: null
                    }));
                }

                // 4. Read the new sentential form FROM THE TREE (single source of truth)
                const newForm = this._getSententialForm(newTree);

                // 5. Pruning — check terminal consistency with target
                if (!this._isConsistent(newForm, target, mode)) continue;

                // 6. Pruning — terminal count must not exceed target length
                const termCount = newForm.filter(s => s.type === 'terminal').length;
                if (termCount > target.length) continue;

                // 7. Dedup — skip if we've seen this sentential form before
                const formKey = this._formKey(newForm);
                if (visited.has(formKey)) continue;
                visited.add(formKey);

                // 8. Record derivation step
                const newSteps = [
                    ...current.steps,
                    { form: newForm, rule: rule.original }
                ];

                queue.push({
                    tree: newTree,
                    steps: newSteps,
                    depth: current.depth + 1
                });
            }
        }

        console.log(`✗ No derivation found (${statesExplored} states explored)`);
        console.groupEnd();
        return null;
    }

    // =========================================================
    //  TREE TRAVERSAL — TREE IS THE SINGLE SOURCE OF TRUTH
    // =========================================================

    /**
     * Find the leftmost or rightmost non-terminal leaf node in the tree.
     *
     * Returns { node, path } where path is an array of child indices
     * from root to the leaf, or null if no non-terminal leaf exists.
     *
     * Only considers nodes with children === null (unexpanded leaves).
     * Epsilon and terminal leaves are NOT considered.
     */
    _findNTLeaf(tree, mode) {
        const leaves = [];
        this._collectLeavesWithPath(tree, [], leaves);

        // Filter to non-terminal unexpanded leaves only
        const ntLeaves = leaves.filter(l => l.node.type === 'nonterminal');

        if (ntLeaves.length === 0) return null;

        return mode === 'leftmost' ? ntLeaves[0] : ntLeaves[ntLeaves.length - 1];
    }

    /**
     * Collect ALL leaf nodes (children === null) with their paths.
     * A path is the sequence of child indices from root to the leaf.
     * Traversal order is left-to-right (preserves tree structure).
     */
    _collectLeavesWithPath(node, currentPath, results) {
        if (!node) return;
        if (node.children === null) {
            results.push({ node, path: [...currentPath] });
        } else {
            for (let i = 0; i < node.children.length; i++) {
                this._collectLeavesWithPath(
                    node.children[i],
                    [...currentPath, i],
                    results
                );
            }
        }
    }

    /**
     * Navigate to a specific node in the tree using a path
     * (array of child indices from root).
     */
    _getNodeByPath(tree, path) {
        let node = tree;
        for (const idx of path) {
            if (!node.children || idx >= node.children.length) return null;
            node = node.children[idx];
        }
        return node;
    }

    /**
     * Get the sentential form by reading ALL non-epsilon leaf nodes
     * from left to right. This is the canonical representation of
     * what the tree currently derives.
     *
     * Epsilon leaves are excluded because ε represents the empty string
     * and does not contribute to the sentential form.
     */
    _getSententialForm(tree) {
        const form = [];
        this._collectActiveLeaves(tree, form);
        return form;
    }

    /**
     * Collect non-epsilon leaf symbols in left-to-right tree order.
     */
    _collectActiveLeaves(node, result) {
        if (!node) return;
        if (node.children === null) {
            // Leaf node — include unless it is epsilon
            if (node.type !== 'epsilon') {
                result.push({ value: node.symbol, type: node.type });
            }
        } else {
            for (const child of node.children) {
                this._collectActiveLeaves(child, result);
            }
        }
    }

    /**
     * Get the terminal-only string derived by the tree.
     * This is what you compare against the target.
     */
    _getTerminalString(tree) {
        const form = this._getSententialForm(tree);
        return form
            .filter(s => s.type === 'terminal')
            .map(s => s.value)
            .join('');
    }

    // =========================================================
    //  PRUNING — EARLY REJECTION OF DEAD-END PATHS
    // =========================================================

    /**
     * Check if the current sentential form is consistent with the target.
     *
     * For leftmost derivation:
     *   All terminals BEFORE the first remaining NT must match the target prefix.
     *
     * For rightmost derivation:
     *   All terminals AFTER the last remaining NT must match the target suffix.
     */
    _isConsistent(form, target, mode) {
        if (mode === 'leftmost') {
            let tIdx = 0;
            for (let i = 0; i < form.length; i++) {
                if (form[i].type === 'nonterminal') break;
                if (tIdx >= target.length || form[i].value !== target[tIdx]) {
                    return false;
                }
                tIdx++;
            }
        } else {
            let tIdx = target.length - 1;
            for (let i = form.length - 1; i >= 0; i--) {
                if (form[i].type === 'nonterminal') break;
                if (tIdx < 0 || form[i].value !== target[tIdx]) {
                    return false;
                }
                tIdx--;
            }
        }
        return true;
    }

    // =========================================================
    //  UTILITIES
    // =========================================================

    /**
     * Unique string key for a sentential form (used for visited set).
     */
    _formKey(form) {
        return form.map(s => s.value).join('');
    }

    /**
     * Deep clone a parse tree node and all its descendants.
     */
    _cloneTree(node) {
        if (!node) return null;
        return {
            symbol: node.symbol,
            type: node.type,
            children: node.children ? node.children.map(c => this._cloneTree(c)) : null
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DerivationEngine;
}
