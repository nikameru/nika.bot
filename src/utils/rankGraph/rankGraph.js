const vega = require('vega');
const vl = require('vega-lite');
const fs = require('fs');

function renderOsuDroidRankGraph(id) {
    const stackedBarChartSpec = require('../../data/settings.json');
    const vegaSpec = vl.compile(stackedBarChartSpec).spec;

    const view = new vega.View(vega.parse(vegaSpec))
        .renderer('none')
        .initialize();

    view.toCanvas()
        .then(function (canvas) {
            const file = fs.createWriteStream(`../../../media/rank_graphs/${id}graph.png`);
            const stream = canvas.createPNGStream();

            stream.pipe(file);
        })
        .catch(function (err) {
            console.log('~ error while rendering PNG graph:');
            console.error(err);
        });
}

module.exports = { renderOsuDroidRankGraph };