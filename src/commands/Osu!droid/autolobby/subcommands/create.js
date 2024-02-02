const { MessageEmbed } = require('discord.js');
const fs = require('node:fs');
const path = require('path');
const wait = require('node:timers/promises').setTimeout;
const EventEmitter = require('node:events');
const droidApi = require('../../../../utils/droidApi/droidApi.js');
const leaderboard = require('./leaderboard.js');

const somethingWentWrongEmbed = new MessageEmbed()
    .setColor('#ff4646')
    .setDescription('❌ **| Something went wrong.**');

const socketDisconnectEmbed = new MessageEmbed()
    .setTitle('❗ | Socket disconnect!')
    .setColor('#ff4646');

const serverErrorEmbed = new MessageEmbed()
    .setTitle('❌ | Server error!')
    .setColor('#ff4646');

const roomChatLogEmbed = new MessageEmbed()
    .setTitle('💬 | Autolobby chat log')
    .setColor('#4cd0ff');

const createdRoomEmbed = new MessageEmbed()
    .setColor('#99ec00');

// Forced mods that can be enabled based on picked map type

const supportedForceMods = {
    'DT': 'd',
    'HD': 'h',
    'HR': 'r',
    'NM': ''
};

// Available map types collections

var mapCollections = [];

// Scanning maps library

const parsedCollections = fs.readdirSync(path.resolve(__dirname, '../../../../data/maps'));

if (!parsedCollections) return;

for (let collection of parsedCollections) {
    if (collection.endsWith('.json')) {
        console.log(collection);

        let name = collection.slice(0, collection.indexOf('.json'));
        mapCollections.push(name);
    }
}

const connectedToSocketEmitter = new EventEmitter();

function isEveryoneReady(players) {
    for (let player of players.values()) {
        if (player.status != 1) {
            return false;
        }
    }

    return true;
}

function pickRandomMapHash(archetype) {
    const sortedMaps = require(`../../../../data/maps/${archetype}.json`);

    return sortedMaps.hashes[Math.floor(Math.random() * (sortedMaps.size - 1))];
}

function pickRandomBeatmap(archetype) {
    const beatmapHash = pickRandomMapHash(archetype);

    if (!droidApi.changeRoomBeatmap(beatmapHash)) {
        pickRandomBeatmap(archetype);
    }
}

function handleRoomCommands(uid, message, autolobby) {
    // Command handling

    if (!message.startsWith('/')) return;

    const roomCommandArgs = message.slice(1).split(' ');
    const roomCommandName = roomCommandArgs.shift();

    console.log(`~ command: ${roomCommandName} with args "${roomCommandArgs.join(', ')}"`);

    switch (roomCommandName) {
        case 'help':
        case 'h':
            droidApi.messageRoomChat(
                '/help - Sends a list of bot\'s commands (/h), ' +
                '/type [type] (forced) - Change picked beatmaps type (/t)'
            );
            droidApi.messageRoomChat(
                '/skip - Start a vote for skipping current beatmap (/s), ' +
                '/credits - Information about the bot (/c)'
            );
            break;
        case 'type':
        case 't':
            var forceMods = false;

            // Check if room should have corresponding mods forced (if supported)

            if (roomCommandArgs.includes('forced')) {
                roomCommandArgs.pop();

                forceMods = true;
            }

            let type = roomCommandArgs.length > 1 ? roomCommandArgs.join(' ') : roomCommandArgs[0];

            if (!mapCollections.includes(type)) {
                droidApi.messageRoomChat(
                    `No type ${type} found! Available types: ${mapCollections.join(', ')}`
                );
            } else {
                autolobby.archetype = type;

                // Changing room name to display current map type

                droidApi.setRoomName(`『${autolobby.archetype}』autolobby`);

                // Skipping current beatmap so that type change has effect immediately

                pickRandomBeatmap(autolobby.archetype);

                // Forcing corresponding mod if needed
                // Otherwise mods are set to being free in case they weren't previously

                if (!forceMods) {
                    droidApi.setPlayerMods(supportedForceMods['NM']);
                    droidApi.setRoomMods(supportedForceMods['NM']);
                    droidApi.setRoomFreeMods(true);

                    return;
                }

                // First two symbols of the current type, so DT, HR, etc.

                const forcedMod = autolobby.archetype.slice(0, 2);

                if (forcedMod in supportedForceMods) {
                    droidApi.setRoomFreeMods(false);
                    droidApi.setPlayerMods(supportedForceMods[forcedMod]);
                    droidApi.setRoomMods(supportedForceMods[forcedMod]);
                } else {
                    droidApi.messageRoomChat(
                        `There aren\'t any mods that can be forced for type "${autolobby.archetype}"!`
                    );
                }
            }
            break;
        case 'skip':
        case 's':
            if (autolobby.playersSkipped.has(uid)) {
                return droidApi.messageRoomChat('You\'ve already voted!');
            }

            autolobby.playersSkipped.add(uid);

            if (autolobby.playersSkipped.size == 1) {
                droidApi.messageRoomChat(
                    `Started beatmap skip voting (1/${autolobby.players.size - 1} voted, ` +
                    `${Math.ceil(0.5 * (autolobby.players.size - 1))} required)`
                );
            } else {
                droidApi.messageRoomChat(
                    `${autolobby.playersSkipped.size}/${autolobby.players.size - 1} voted ` +
                    `(${Math.ceil(0.5 * (autolobby.players.size - 1))} required)`
                );
            }

            if (autolobby.playersSkipped.size / (autolobby.players.size - 1) >= 0.5) {
                // Not clearing playersSkipped because that is done when beatmap is changed

                pickRandomBeatmap(autolobby.archetype);
            }
            break;
        case 'kick':
        case 'k':
            // TODO: kick voting (locked temporarily to avoid command abuse)
            if (uid != '163476' || uid == '454815') return;

            let playerUid = roomCommandArgs[0] || null;

            if (!playerUid) {
                return droidApi.messageRoomChat('Please specify uid of the player you want to kick!');
            } else if (!autolobby.players.get(playerUid)) {
                return droidApi.messageRoomChat('There\'s no such player in the room!');
            }

            droidApi.kickPlayer(playerUid);
            break;
        case 'credits':
        case 'c':
            droidApi.messageRoomChat(
                'This bot is made for autopicking beatmaps ' +
                'in osu!droid multiplayer based on the chosen map type. ' +
                'Credits: nikameru (development), unclem (map library)'
            );
            break;
        default:
            droidApi.messageRoomChat(
                `No command ${roomCommandName} found! See /help for available commands.`
            );
            break;
    }
}

async function run(client, interaction, db, autolobby, shouldReconnect = false) {
    const logsChannel = await client.channels.fetch('943228757387407400');

    if (shouldReconnect) {
        // Default map type

        autolobby.archetype = 'NM1';
    } else {
        await interaction.deferReply();

        autolobby.archetype = await interaction.options.getString('archetype') || 'NM1';

        if (!mapCollections.includes(autolobby.archetype)) {
            return interaction.editReply({ content: 'Specified map archetype not found!' });
        }
    }

    var roomInfo = await droidApi.createRoom();
    if (!roomInfo) return interaction.channel.send({ embeds: [somethingWentWrongEmbed] });

    if (shouldReconnect) {
        createdRoomEmbed.setDescription(
            `✅ **| Created __new__ autolobby due to inactivity kick alert with default map type ("NM1").**`
        );

        await interaction.channel.send({ embeds: [createdRoomEmbed] });
    } else {
        createdRoomEmbed.setDescription(
            `✅ **| Created autolobby __『${autolobby.archetype}』autolobby__.**`
        );

        await interaction.editReply({ embeds: [createdRoomEmbed] });
    }

    connectedToSocketEmitter.once('socketConnection', async (connectedSocket) => {
        // Setting variables as it is *initial* connection

        autolobby.socket = connectedSocket;
        autolobby.status = 0;
        autolobby.players = new Map();
        autolobby.playersSkipped = new Set();

        // Needs to be set manually: event 'playerJoined' doesn't being listened to yet

        autolobby.players.set('454815', { username: 'nika_bot', status: 1 });

        // Free mods setting is true by default

        droidApi.setRoomFreeMods(true);
        droidApi.setRoomName(`『${autolobby.archetype}』autolobby`);

        // Force setting initial map

        pickRandomBeatmap(autolobby.archetype);

        await droidApi.setPlayerStatus(1);

        // Additional 'disconnect' event for handling random disconnections

        autolobby.socket.on('disconnect', async (reason) => {
            if (reason == 'io client disconnect') return;

            await logsChannel.send({
                content: '<@!600113325178880002>',
                embeds: [socketDisconnectEmbed.setDescription(`Reason: **${reason}**`)]
            });

            // Ensuring that data in 'players' is up-to-date after being reconnected

            await autolobby.socket.once('initialConnection', (data) => {
                const updatedPlayers = data.players;

                for (let updatedPlayer of updatedPlayers) {
                    autolobby.players.set(updatedPlayer.uid, [updatedPlayer.username, updatedPlayer.status]);
                }
            });

            await droidApi.reconnectToRoom();

            // Bot status needs to be reverted back to 'ready' after reconnection

            await droidApi.setPlayerStatus(1);
        });

        autolobby.socket.on('error', (error) => {
            logsChannel.send({
                content: '<@!600113325178880002>',
                embeds: [serverErrorEmbed.setDescription(`Error: **${error}**`)]
            });

            if (error.includes('do not have permission')) droidApi.reconnectToRoom();
        });

        autolobby.socket.on('playerJoined', (data) => {
            console.log(`~ player joined: ${data.username} (uid: ${data.uid})`);

            droidApi.messageRoomChat(
                `${data.username}, welcome to autolobby! Type /help to see available commands`
            );

            autolobby.players.set(data.uid, { username: data.username, status: data.status });
        });

        autolobby.socket.on('playerLeft', (uid) => {
            console.log(`~ player left (uid: ${uid})`);

            autolobby.players.delete(uid);
            autolobby.playersSkipped.delete(uid);
        });

        autolobby.socket.on('playerStatusChanged', (uid, status) => {
            console.log(`~ player status changed (uid: ${uid}, status: ${status})`);

            let player = autolobby.players.get(uid);

            if (!player) {
                return console.log(`~ warning: tried to change status of unknown player (uid: ${uid})!`);
            }

            player.status = status;

            // If room has at least 2 players (including bot) and everyone is ready, start match

            if (autolobby.players.size >= 2 && isEveryoneReady(autolobby.players)) {
                droidApi.messageRoomChat('Starting match in 5 seconds...');

                // Initialize live leaderboard log for upcoming match
                
                leaderboard.run(client, interaction, db, autolobby, true);

                (async () => {
                    await wait(5000);

                    // To ensure that bot isn't alone by the time these 5 seconds elaspe
                    
                    if (autolobby.players.size < 2) return;
                    await droidApi.roomMatchPlay();
                })();
            }
        });

        autolobby.socket.on('chatMessage', (uid, message) => {
            // Chat logging

            roomChatLogEmbed.addFields({
                name: `**${autolobby.players.get(uid) ? autolobby.players.get(uid).username : 'SYSTEM'}**`,
                value: message
            });

            if (roomChatLogEmbed.fields.length == 5) {
                logsChannel.send({ embeds: [roomChatLogEmbed.setTimestamp()] });

                roomChatLogEmbed.spliceFields(0, 5);
            }

            // Creating new room in order not to get kicked for inactivity in case nobody plays

            if (!uid && message.includes('host will be kicked for inactivity')) {
                return run(client, interaction, db, autolobby, true);
            }

            // Handle commands

            handleRoomCommands(uid, message, autolobby);
        });

        autolobby.socket.on('beatmapChanged', (map) => {
            // Always cleaning previous skip voting results

            autolobby.playersSkipped.clear();

            droidApi.messageRoomChat(`Changed beatmap to ${map.artist} - ${map.title} [${map.version}]`);

            autolobby.beatmap = map.md5;
        });

        autolobby.socket.on('roomStatusChanged', (status) => {
            console.log(`~ room status changed: ${autolobby.status} -> ${status}`);

            // Ensuring that status has *changed* to 0 to avoid looped beatmap changing

            if (status == 0) {
                // New room status means players have to press ready again
                // Because of that bot status is changed only at this point

                droidApi.setPlayerStatus(1);

                if (status != autolobby.status) {
                    console.log(`~ changing beatmap...`);

                    pickRandomBeatmap(autolobby.archetype);
                }
            }

            autolobby.status = status;
        });
    });

    droidApi.connectToRoom(roomInfo.id, connectedToSocketEmitter);
}

const config = {
    name: 'create'
};

module.exports = { run, config };