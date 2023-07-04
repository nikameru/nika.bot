const axios = require('axios');
const cheerio = require('cheerio');

const url = 'http://osudroid.moe/';
const profilePath = 'profile.php?uid=';

async function getRecentPlays(uid, amount) {
    const plays = [];
    const endpoint = url + profilePath + uid.toString();

    const res = await axios.get(endpoint);

    console.log(`~ STATUS: ${res.status} (${res.statusText})`);

    if (res.status == 200) {
        const $ = cheerio.load(res.data);

        $('body > main > div > li > div > a').each(function (i, res) {
            if (i < amount) {
                plays.push($(this).text());
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
        formattedPlay.date = play.substring(play.indexOf('\n\n\n'), play.indexOf(' / score: ')).trim();
        formattedPlay.score = play.substring(play.indexOf(' / score: ') + 10, play.indexOf(' / mod: ')).replaceAll(',', '');
        formattedPlay.mods = play.substring(play.indexOf(' / mod: ') + 8, play.indexOf(' / combo: '));
        formattedPlay.combo = play.substring(play.indexOf(' / combo: ') + 10, play.indexOf(' x / accuracy: '));
        formattedPlay.accuracy = play.substring(play.indexOf(' x / accuracy: ') + 15, play.indexOf('%\n miss: '));
        formattedPlay.misscount = play.substring(play.indexOf('%\n miss: ') + 9, play.indexOf('\n{""hash":'));
    
        plays.push(formattedPlay);
    }

    console.log(plays);
}

//getRecentPlays(68403, 3);

module.exports = { getRecentPlays };