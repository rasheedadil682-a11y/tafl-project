/**
 * Parse Tree Renderer Module
 * Renders a parse tree onto an HTML5 Canvas with a cinematic dark futuristic aesthetic.
 */

class ParseTreeRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.scale = 1;
        this.tree = null;
        this.layoutData = null;

        // Cinematic styling
        this.colors = {
            bg: '#0a0812',
            node_nt: '#ffaa55',
            node_nt_bg: 'rgba(255,140,50,0.1)',
            node_nt_border: 'rgba(255,160,60,0.5)',
            node_t: '#ffd700',
            node_t_bg: 'rgba(255,215,0,0.08)',
            node_t_border: 'rgba(255,215,0,0.5)',
            node_eps: '#06d6a0',
            node_eps_bg: 'rgba(6,214,160,0.08)',
            node_eps_border: 'rgba(6,214,160,0.5)',
            edge: 'rgba(255,140,50,0.25)',
            edgeGlow: 'rgba(255,140,50,0.08)',
            text: '#f0e6d8',
        };

        this.nodeRadius = 24;
        this.levelHeight = 80;
        this.siblingSpacing = 16;
        this.padding = 50;
    }

    /**
     * Render a parse tree.
     * @param {Object} tree - Parse tree root node { symbol, type, children }
     */
    render(tree) {
        this.tree = tree;

        // Layout the tree (compute x, y positions)
        this.layoutData = this._layoutTree(tree);

        // Compute canvas dimensions
        const bounds = this._computeBounds(this.layoutData);
        const width = (bounds.maxX - bounds.minX) + this.padding * 2;
        const height = (bounds.maxY - bounds.minY) + this.padding * 2;

        // Set canvas size (account for DPI)
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = width * dpr * this.scale;
        this.canvas.height = height * dpr * this.scale;
        this.canvas.style.width = (width * this.scale) + 'px';
        this.canvas.style.height = (height * this.scale) + 'px';

        this.ctx.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, 0, 0);

        // Offset so tree starts at padding
        const offsetX = -bounds.minX + this.padding;
        const offsetY = -bounds.minY + this.padding;

        // Clear
        this.ctx.fillStyle = this.colors.bg;
        this.ctx.fillRect(0, 0, width, height);

        // Draw subtle grid
        this._drawGrid(width, height);

        // Draw edges first (behind nodes)
        this._drawEdges(this.layoutData, offsetX, offsetY);

        // Draw nodes
        this._drawNodes(this.layoutData, offsetX, offsetY);
    }

    /**
     * Layout algorithm: assigns (x, y) to each node using a simple recursive approach.
     * Uses the Reingold-Tilford-inspired approach for nice spacing.
     */
    _layoutTree(node, depth = 0) {
        const layoutNode = {
            symbol: node.symbol,
            type: node.type,
            x: 0,
            y: depth * this.levelHeight,
            children: [],
            width: 0
        };

        if (!node.children || node.children.length === 0) {
            // Leaf node
            layoutNode.width = this.nodeRadius * 2 + this.siblingSpacing;
            return layoutNode;
        }

        // Layout children recursively
        let childLayouts = node.children.map(c => this._layoutTree(c, depth + 1));
        layoutNode.children = childLayouts;

        // Total width needed
        const totalWidth = childLayouts.reduce((sum, c) => sum + c.width, 0);
        layoutNode.width = Math.max(totalWidth, this.nodeRadius * 2 + this.siblingSpacing);

        // Position children
        let currentX = -totalWidth / 2;
        for (const child of childLayouts) {
            child.x = currentX + child.width / 2;
            currentX += child.width;
        }

        return layoutNode;
    }

    /**
     * Convert relative positions to absolute positions.
     */
    _absolutePositions(node, parentX = 0) {
        node.x += parentX;
        for (const child of node.children) {
            this._absolutePositions(child, node.x);
        }
    }

    /**
     * Compute bounding box.
     */
    _computeBounds(node) {
        // First convert to absolute
        this._absolutePositions(node, 0);

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        const stack = [node];
        while (stack.length > 0) {
            const n = stack.pop();
            minX = Math.min(minX, n.x - this.nodeRadius);
            maxX = Math.max(maxX, n.x + this.nodeRadius);
            minY = Math.min(minY, n.y - this.nodeRadius);
            maxY = Math.max(maxY, n.y + this.nodeRadius);
            for (const c of n.children) {
                stack.push(c);
            }
        }

        return { minX, maxX, minY, maxY };
    }

    /**
     * Draw background grid.
     */
    _drawGrid(width, height) {
        this.ctx.strokeStyle = 'rgba(255, 140, 50, 0.025)';
        this.ctx.lineWidth = 0.5;
        const step = 30;
        for (let x = 0; x < width; x += step) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, height);
            this.ctx.stroke();
        }
        for (let y = 0; y < height; y += step) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(width, y);
            this.ctx.stroke();
        }
    }

    /**
     * Draw edges between parent and children.
     */
    _drawEdges(node, offsetX, offsetY) {
        const px = node.x + offsetX;
        const py = node.y + offsetY;

        for (const child of node.children) {
            const cx = child.x + offsetX;
            const cy = child.y + offsetY;

            // Glow effect
            this.ctx.beginPath();
            this.ctx.strokeStyle = this.colors.edgeGlow;
            this.ctx.lineWidth = 5;
            this.ctx.moveTo(px, py + this.nodeRadius);
            this.ctx.lineTo(cx, cy - this.nodeRadius);
            this.ctx.stroke();

            // Main edge
            this.ctx.beginPath();
            this.ctx.strokeStyle = this.colors.edge;
            this.ctx.lineWidth = 1.5;
            this.ctx.moveTo(px, py + this.nodeRadius);
            this.ctx.lineTo(cx, cy - this.nodeRadius);
            this.ctx.stroke();

            // Recurse
            this._drawEdges(child, offsetX, offsetY);
        }
    }

    /**
     * Draw nodes.
     */
    _drawNodes(node, offsetX, offsetY) {
        const x = node.x + offsetX;
        const y = node.y + offsetY;

        let bgColor, borderColor, textColor;

        if (node.type === 'nonterminal') {
            bgColor = this.colors.node_nt_bg;
            borderColor = this.colors.node_nt_border;
            textColor = this.colors.node_nt;
        } else if (node.type === 'epsilon') {
            bgColor = this.colors.node_eps_bg;
            borderColor = this.colors.node_eps_border;
            textColor = this.colors.node_eps;
        } else {
            bgColor = this.colors.node_t_bg;
            borderColor = this.colors.node_t_border;
            textColor = this.colors.node_t;
        }

        // Outer glow
        this.ctx.beginPath();
        this.ctx.arc(x, y, this.nodeRadius + 4, 0, Math.PI * 2);
        const glowGrad = this.ctx.createRadialGradient(x, y, this.nodeRadius, x, y, this.nodeRadius + 12);
        glowGrad.addColorStop(0, borderColor.replace('0.5', '0.15'));
        glowGrad.addColorStop(1, 'transparent');
        this.ctx.fillStyle = glowGrad;
        this.ctx.fill();

        // Background circle
        this.ctx.beginPath();
        this.ctx.arc(x, y, this.nodeRadius, 0, Math.PI * 2);
        this.ctx.fillStyle = bgColor;
        this.ctx.fill();
        this.ctx.strokeStyle = borderColor;
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();

        // Text
        this.ctx.fillStyle = textColor;
        this.ctx.font = `600 14px 'Rajdhani', sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(node.symbol, x, y + 1);

        // Draw children
        for (const child of node.children) {
            this._drawNodes(child, offsetX, offsetY);
        }
    }

    /**
     * Zoom controls
     */
    zoomIn() {
        this.scale = Math.min(this.scale * 1.2, 3);
        if (this.tree) this.render(this.tree);
    }

    zoomOut() {
        this.scale = Math.max(this.scale / 1.2, 0.3);
        if (this.tree) this.render(this.tree);
    }

    resetZoom() {
        this.scale = 1;
        if (this.tree) this.render(this.tree);
    }

    /**
     * Download canvas as PNG.
     */
    downloadPNG() {
        const link = document.createElement('a');
        link.download = 'parse-tree.png';
        link.href = this.canvas.toDataURL('image/png');
        link.click();
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ParseTreeRenderer;
}
