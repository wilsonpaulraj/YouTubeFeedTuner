// Chart.js Script (Basic Version)
class Chart {
    constructor(ctx, config) {
        this.ctx = ctx;
        this.config = config;
        this.draw();
    }

    draw() {
        const { labels, datasets } = this.config.data;
        let total = datasets[0].data.reduce((a, b) => a + b, 0);

        let output = labels.map((label, i) => `${label}: ${datasets[0].data[i]} (${Math.round((datasets[0].data[i] / total) * 100)}%)`).join("\n");
        this.ctx.innerText = output;
    }
}
