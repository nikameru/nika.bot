const vega = require('vega');
const vl = require('vega-lite');
const fs = require('fs');
const http = require('http');

function renderOsuDroidRankGraph(userId, droidId, droidGraphRenderedEmitter) {
    const requestOptions = {
        host: 'beta.acivev.de',
        path: '/api/profile/stats/timeline/' + droidId
    };

    const req = http.get(requestOptions, function (res) {
        console.log('~ STATUS: ' + res.statusCode);

        const bodyChunks = [];

        res.on('data', function (chunk) {
            bodyChunks.push(chunk);
        }).on('end', function () {
            const body = Buffer.concat(bodyChunks);
            const timelineJson = JSON.parse(body).list;

            console.log('~ BODY: ' + body);

            const chartSpec = require('../../data/vegaSpecs.json');
            chartSpec.data.values = timelineJson;

            const vegaSpec = vl.compile(chartSpec).spec;

            const view = new vega.View(vega.parse(vegaSpec))
                .renderer('none')
                .initialize();

            view.toCanvas()
                .then(function (canvas) {
                    const file = fs.createWriteStream(`../media/rank_graphs/${userId}graph.png`);
                    const stream = canvas.createPNGStream();

                    stream.pipe(file);
                })
                .catch(function (err) {
                    console.log('~ error while rendering PNG graph:');
                    console.error(err);
                });

            droidGraphRenderedEmitter.emit('graphRendered');
        })
    });

    req.on('error', function (err) {
        console.log('~ ERROR: ' + err.message);
    });
}

module.exports = { renderOsuDroidRankGraph };