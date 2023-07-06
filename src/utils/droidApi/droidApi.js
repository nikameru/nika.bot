const axios = require('axios');
const cheerio = require('cheerio');

const droidUrl = 'http://osudroid.moe/';
const profilePath = 'profile.php?uid=';

const osuUrl = 'https://osu.ppy.sh/';
const beatmapPath = `api/get_beatmaps?k=${process.env.OSU_API_KEY}&h=`;

async function getRecentPlays(uid, index, amount) {
    const plays = [];
    const endpoint = droidUrl + profilePath + uid.toString();
    index -= 1;

    const res = await axios.get(endpoint);

    console.log(`~ STATUS: ${res.status} (${res.statusText})`);

    if (res.status == 200) {
        const $ = cheerio.load(res.data);

        var play;
        var stats;
        var rankIcon;

        $('body > main > div > li').each(function (i, res) {
            if (i < index + amount && i >= index) {
                stats = $(this).find('div > a').text();
                rankIcon = $(this).find('a > img').attr('src');

                play = stats + '\nrank: ' + rankIcon;
                console.log(play);

                plays.push(play);
            }
        });

        responseFormatter(plays);

        return plays;
    } else {
        return false;
    }
}

function responseFormatter(plays) {
    var play;
    var formattedPlay;

    for (let i = 0; i < plays.length; i++) {
        play = plays.shift();
        formattedPlay = {};

        formattedPlay.title = play.substring(0, play.indexOf('\n\n\n')).trim();
        formattedPlay.rank = play.substring(play.indexOf('\nrank: ../assets/img/ranking-') + 29, play.indexOf('.png'));
        formattedPlay.date = play.substring(play.indexOf('\n\n\n'), play.indexOf(' / score: ')).trim();
        formattedPlay.score = play.substring(play.indexOf(' / score: ') + 10, play.indexOf(' / mod: '));

        formattedPlay.mods = play.substring(play.indexOf(' / mod: ') + 8, play.indexOf(' / combo: '));
        if (formattedPlay.mods == ' ') formattedPlay.mods = 'No Mod';

        formattedPlay.combo = play.substring(play.indexOf(' / combo: ') + 10, play.indexOf(' x / accuracy: '));
        formattedPlay.accuracy = play.substring(play.indexOf(' x / accuracy: ') + 15, play.indexOf('%\n miss: '));
        formattedPlay.misscount = play.substring(play.indexOf('%\n miss: ') + 9, play.indexOf('\n{""hash":'));
        formattedPlay.hash = play.substring(play.indexOf('\n{""hash":') + 10, play.indexOf('}\n\n')).trim();
    
        plays.push(formattedPlay);
    }

    console.log(plays);
}

async function getBeatmapInfoByHash(hash) {
    const endpoint = osuUrl + beatmapPath + hash;
    const res = await axios.get(endpoint);

    console.log(`~ STATUS: ${res.status} (${res.statusText})`);

    return res.data;
}

module.exports = { getRecentPlays, getBeatmapInfoByHash };