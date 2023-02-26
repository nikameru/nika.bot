const vega = require('vega');
const vl = require('vega-lite');
const fs = require('fs');
const http = require('http');

function getGraphScaleByRank (list) {
    const ranksArray = list.map(item => item.rank);

    ranksArray.sort(function (a, b) {
        return a - b;
    });
    
    return [ranksArray[0] - 50, ranksArray.pop() + 50];
}

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
            chartSpec.encoding.y.scale.domain = getGraphScaleByRank(timelineJson);

            const vegaSpec = vl.compile(chartSpec).spec;

            const view = new vega.View(vega.parse(vegaSpec))
                .renderer('none')
                .initialize();

            view.toCanvas()
                .then(function (canvas) {
                    try {
                        const file = fs.createWriteStream(`../media/rank_graphs/graph.png`);
                        const stream = canvas.createPNGStream();
                        stream.pipe(file);
                    } catch (err) {
                        console.log(err);
                    }
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