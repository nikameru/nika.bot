const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const { io } = require('socket.io-client');
const wait = require('node:timers/promises').setTimeout;

const droidUrl = 'http://osudroid.moe/';
const droidDPPUrl = 'http://droidpp.osudroid.moe/profile/';
const profilePath = 'profile.php?uid=';

const droidMultiUrl = 'https://multi.osudroid.moe';
const getRoomsPath = '/getrooms';
const createRoomPath = '/createroom';

const osuUrl = 'https://osu.ppy.sh/';
const beatmapPath = `api/get_beatmaps?k=${process.env.OSU_API_KEY}&h=`;

const createRoomRequest = {
    'name': 'nika_bot\'s autolobby',
    'maxPlayers': 16,
    'host': {
        'uid': '454815',
        'username': 'nika_bot'
    },
    'beatmap': {
        'md5': '2f947de25fc079365ba2e068582dcd54',
        'title': 'Rererepeat',
        'artist': 'frederic',
        'creator': 'n0ah',
        'version': 'Rererepeat'
    },
    'sign': process.env.DROID_CREATEROOM_SIGN
};

const authData = {
    uid: '454815',
    username: 'nika_bot',
    version: '6',
    authSign: process.env.DROID_SOCKETAUTH_SIGN
};

const blankScore = {
    'accuracy': 0,
    'score': 0,
    'username': 'nika_bot', 
    'modstring': '', 
    'maxCombo': 0,
    'geki': 0,
    'perfect': 0,
    'katu': 0,
    'good': 0,
    'bad': 0,
    'miss': 0,
    'isAlive': false
};

var socket = null;

async function getRooms() {
    var roomList = null;

    await axios.get(droidMultiUrl + getRoomsPath + `?sign=${process.env.DROID_GETROOMS_SIGN}`)
        .then(function (res) {
            if (res.status == 200) {
                console.log(`~ request succeeded: ${res.status} - ${res.statusText}`);
                
                roomList = res.data;
            }
        }).catch(function (err) {
            if (err.response) {
                console.log(`~ request failed: ${err.toJSON().status}`);
            } else {
                console.log(`~ request failed: no response`);
            }
        });

    return roomList;
}

// Name, password, etc. should be static because request sign depends on them

async function createRoom() {
    var roomInfo = null;

    await axios.post(droidMultiUrl + createRoomPath, createRoomRequest)
        .then(function (res) {
            if (res.status == 200) {
                console.log(`~ request succeeded: ${res.status} - ${res.statusText}`);
                roomInfo = res.data;
            }
        }).catch(function (err) {
            if (err.response) {
                console.log(`~ request failed: ${err.toJSON().status}`);
            } else {
                console.log(`~ request failed: no response`);
            }
        });

    return roomInfo;
}

function connectToRoom(roomId, connectedEmitter) {
    if (socket) {
        console.log('~ reconnecting to socket');
        disconnectFromRoom();
    }

    console.log(`~ connecting to socket (${droidMultiUrl}/${roomId}), ${JSON.stringify(authData)}`);

    socket = io(`${droidMultiUrl}/${roomId}`, {
        auth: authData,
        reconnection: false
    }).connect();

    socket.on('connect', () => {
        console.log(`~ connected successfully to socket ${socket.id}`);

        connectedEmitter.emit('socketConnection', socket);
    });

    socket.on('connect_error', (err) => {
        console.log(`~ error while connecting to socket: ${err}`);
    });

    socket.on('disconnect', (reason) => {
        console.log(`~ disconnected from socket: ${reason}`);
    });

    return socket;
}

async function reconnectToRoom() {
    console.log('~ trying to reconnect...');

    if (!socket) {
        return console.log('~ warning: tried to reconnect while no socket instance is present!');
    }

    await wait(2000);

    await socket.connect(async (err) => {
        if (err) {
            console.log(`~ encountered an error while reconnecting: ${err}!`);
            await reconnectToRoom();
        } else {
            console.log('~ reconnected successfully');
        }
    });
}

async function disconnectFromRoom() {
    if (socket) {
        await socket.disconnect();
        return true;
    } else {
        return false;
    }
}

async function changeRoomBeatmap(hash) {
    const beatmapInfo = await getBeatmapInfoByHash(hash);

    if (!beatmapInfo[0]) return false;

    const roomBeatmapInfo = {
        'md5': hash,
        'title': beatmapInfo[0].title,
        'artist': beatmapInfo[0].artist,
        'version': beatmapInfo[0].version,
        'creator': beatmapInfo[0].creator
    };

    await socket.emit('beatmapChanged', roomBeatmapInfo);
    console.log(`~ changed room beatmap to ${beatmapInfo[0].artist} - ${beatmapInfo[0].title} (${hash})`);

    return true;
}

function setPlayerStatus(status) {
    socket.emit('playerStatusChanged', status);
    console.log(`~ changed player status to ${status}`);
}

async function roomMatchPlay() {
    await socket.emit('playBeatmap');

    await wait(1000);
    await socket.emit('beatmapLoadComplete');
    
    console.log(`~ emitted match start`);

    socket.once('allPlayersBeatmapLoadComplete', async () => {
        await wait(1000);
        await socket.emit('skipRequested');

        await wait(2000);
        await socket.emit('scoreSubmission', blankScore);

        console.log(`~ submitted blank score`);
    });
}

function messageRoomChat(message) {
    socket.emit('chatMessage', `[BOT] ${message}`);
    console.log(`~ sent message: ${message}`);
}

function setRoomName(name) {
    if (name.length > 33) {
        return console.log('~ too many characters in a room name!');
    }

    socket.emit('roomNameChanged', name);
    console.log(`~ changed room name to ${name}`)
}

function setPlayerMods() {

}

function setRoomFreeMods(value) {
    socket.emit('roomGameplaySettingsChanged', { 'isFreeMod': value });
    console.log(`~ set room free mods to ${value}`);
}

// Other parameters aren't needed, so they're hardcoded

function setRoomMods(mods) {
    const roomMods = {
        'mods': mods,
        'speedMultiplier': 1,
        'flFollowDelay': 0.12
    };

    socket.emit('roomModsChanged', roomMods);
    console.log('`~ changed room mods to', mods);
}

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

async function getProfileDPP(uid) {
    const endpoint = droidDPPUrl + uid;

    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.setViewport({ width: 1000, height: 926 });
    await page.goto(endpoint, { waitUntil: 'networkidle2' });

    const bodyHandle = await page.$('body');
    const html = await page.evaluate(body => body.innerHTML, bodyHandle);

    await bodyHandle.dispose();
    
    const $ = cheerio.load(html);

    return $('div > table > tbody > tr > td').text();
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

        if (formattedPlay.mods == ' ' || formattedPlay.mods.startsWith(', ')) {
            formattedPlay.mods = 'No Mod';
        } else if (formattedPlay.mods.includes('x')) {
            formattedPlay.speedMultiplier = formattedPlay.mods.substring(formattedPlay.mods.indexOf(', x') + 3);
            formattedPlay.mods = formattedPlay.mods.substring(0, formattedPlay.mods.indexOf(', x'));
        }

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

    return res.status == 200 ? res.data : null;
}

module.exports = {
    getRooms, 
    createRoom,
    connectToRoom, 
    reconnectToRoom,
    disconnectFromRoom,
    changeRoomBeatmap,
    setPlayerStatus,
    roomMatchPlay,
    messageRoomChat,
    setRoomFreeMods,
    setRoomMods,
    setRoomName,
    getRecentPlays,
    getProfileDPP,
    getBeatmapInfoByHash
};