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

        return plays;
    } else {
        return false;
    }
}

//getRecentPlays(68403, 2);

module.exports = { getRecentPlays };