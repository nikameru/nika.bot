const fs = require('node:fs');
const wait = require('node:timers/promises').setTimeout;
const EventEmitter = require('node:events');
const path = require('path');

const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const {
    getRooms,
    createRoom,
    connectToRoom,
    reconnectToRoom,
    disconnectFromRoom,
    setPlayerStatus,
    roomMatchPlay,
    changeRoomBeatmap,
    messageRoomChat,
    setRoomFreeMods,
    setRoomMods,
    setRoomName
} = require('../../../utils/droidApi/droidApi.js');

const somethingWentWrongEmbed = new MessageEmbed()
    .setColor('#ff4646')
    .setDescription('❌ **| Something went wrong.**');

const socketDisconnectEmbed = new MessageEmbed()
    .setTitle('❗ | Socket disconnect!')
    .setColor('#ff4646');

const roomChatLogEmbed = new MessageEmbed()
    .setTitle('💬 | Autolobby chat log')
    .setColor('#4cd0ff');

const createdRoomEmbed = new MessageEmbed()
    .setColor('#99ec00');

const roomStatusEmbed = new MessageEmbed()
    .setColor('#ff79b8');

const roomLeaderboardEmbed = new MessageEmbed()
    .setTitle('🏆 | Autolobby live leaderboard')
    .setColor('#e0e346');

const roomStatuses = ['Idle', 'Changing beatmap', 'Playing'];

// Forced mods that can be enabled based on picked map type

const supportedForceMods = {
    'DT': 'dc',
    'HD': 'h',
    'HR': 'r',
    'NM': ''
};

const connectedToSocketEmitter = new EventEmitter();

// Socket instance

var socket = null;

var roomStatus = 0;

// List of players in the room - { uid: [username, status] }

const players = new Map();

// For handling /skip command voting

const playersSkipped = new Set();

// Available map types collections

var mapCollections = [];

// Scanning maps library

const parsedCollections = fs.readdirSync(path.resolve(__dirname, '../../../data/maps'));

if (!parsedCollections) return;

for (let collection of parsedCollections) {
    if (collection.endsWith('.json')) {
        console.log(collection);

        let name = collection.slice(0, collection.indexOf('.json'));
        mapCollections.push(name);
    }
}

function isEveryoneReady(players) {
    for (let player of players.values()) {
        if (player.status != 1) {
            return false;
        }
    }

    return true;
}

function pickRandomMapHash(archetype) {
    const sortedMaps = require(`../../../data/maps/${archetype}.json`);

    return sortedMaps.hashes[Math.floor(Math.random() * (sortedMaps.size - 1))];
}

async function pickRandomBeatmap(archetype) {
    const beatmapHash = pickRandomMapHash(archetype);

    if (!await changeRoomBeatmap(beatmapHash)) pickRandomBeatmap(archetype);
}

async function run(client, interaction, db, shouldReconnect = false) {
    const logsChannel = await client.channels.fetch('943228757387407400');
    const subcommandName = await interaction.options.getSubcommand();

    if (subcommandName == 'create') {
        var archetypeOption;

        if (shouldReconnect) {
            // Default map type

            archetypeOption = 'NM1';
        } else {
            await interaction.deferReply();

            archetypeOption = await interaction.options.getString('archetype') || 'NM1';

            if (!mapCollections.includes(archetypeOption)) {
                return interaction.editReply({ content: 'Specified map archetype not found!' });
            }
        }

        var roomInfo = await createRoom();
        if (!roomInfo) return interaction.channel.send({ embeds: [somethingWentWrongEmbed] });

        if (shouldReconnect) {
            createdRoomEmbed.setDescription(
                `✅ **| Created __new__ autolobby due to inactivity kick alert with default map type ("NM1").**`
            );

            await interaction.channel.send({ embeds: [createdRoomEmbed] });
        } else {
            createdRoomEmbed.setDescription(
                `✅ **| Created autolobby __『${archetypeOption}』autolobby__ with "${archetypeOption}" map type.**`
            );

            await interaction.editReply({ embeds: [createdRoomEmbed] });
        }

        connectedToSocketEmitter.once('socketConnection', async (connectedSocket) => {
            // Setting variables as it is initial connection

            socket = connectedSocket;
            roomStatus = 0;
            players = new Map();
            playersSkipped = new Set();

            // Free mods setting is true by default

            setRoomFreeMods(true);

            setRoomName(`『${archetypeOption}』autolobby`);

            // Force setting initial map

            const initialMap = await pickRandomMapHash(archetypeOption);
            await pickRandomBeatmap(initialMap);

            // Self-bot is ready by default

            players.set('454815', { username: 'nika_bot', status: 1 });
            setPlayerStatus(1);

            // Additional 'disconnect' event for handling random disconnections

            socket.on('disconnect', async (reason) => {
                if (reason == 'io client disconnect') return;

                logsChannel.send({
                    content: '<@!600113325178880002>',
                    embeds: [socketDisconnectEmbed.setDescription(`Reason: **${reason}**`)]
                });

                await reconnectToRoom();

                // Bot status needs to be reverted back to 'ready' after reconnection

                setPlayerStatus(1);
            });

            socket.on('playerJoined', (data) => {
                console.log(`~ player joined: ${data.username} (uid: ${data.uid})`);

                messageRoomChat(`${data.username}, welcome to autolobby! Type /help to see available commands`);

                players.set(data.uid, { username: data.username, status: data.status });
            });

            socket.on('playerLeft', (uid) => {
                console.log(`~ player left (uid: ${uid})`);

                players.delete(uid);
                playersSkipped.delete(uid);
            });

            socket.on('playerStatusChanged', (uid, status) => {
                console.log(`~ player status changed (uid: ${uid}, status: ${status})`);

                players.get(uid).status = status;

                // If room has more than 2 players (including bot) and everyone is ready, start match

                if (players.size >= 2 && isEveryoneReady(players)) {
                    console.log('~ everyone is ready - starting match in 5s');
                    messageRoomChat('Starting match in 5 seconds...');

                    (async () => {
                        await wait(5000);
                        await roomMatchPlay();
                    })();
                }
            });

            socket.on('chatMessage', (uid, message) => {
                // Chat logging

                roomChatLogEmbed.addFields({
                    name: `**${players.get(uid) ? players.get(uid).username : 'SYSTEM'}**`,
                    value: message
                });

                if (roomChatLogEmbed.fields.length == 5) {
                    logsChannel.send({ embeds: [roomChatLogEmbed.setTimestamp()] });

                    roomChatLogEmbed.spliceFields(0, 5);
                }

                // Creating new room in order not to get kicked for inactivity in case nobody plays

                if (!uid && message.includes('host will be kicked for inactivity')) {
                    return run(client, interaction, null, true);
                }

                // Command handling

                if (!message.startsWith('/')) return;

                const roomCommandArgs = message.slice(1).split(' ');
                const roomCommandName = roomCommandArgs.shift();

                console.log(`~ command: ${roomCommandName} with args "${roomCommandArgs.join(', ')}"`);

                switch (roomCommandName) {
                    case 'help':
                    case 'h':
                        messageRoomChat('/help - Sends a list of bot\'s commands (alias: /h)');
                        messageRoomChat('/type [type] (forced) - Change picked beatmaps type (alias: /t)');
                        messageRoomChat('/skip - Start a vote for skipping current beatmap (alias: /s)');
                        messageRoomChat('/credits - Information about the bot (alias: /c)');
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
                            messageRoomChat(`No type ${type} found! Available types: ${mapCollections.join(', ')}`);
                        } else {
                            archetypeOption = type;
                            messageRoomChat(`Changed picked maps type to "${type}"`);

                            // Changing room name to display current map type

                            setRoomName(`『${archetypeOption}』autolobby`);

                            // Skipping current beatmap so that type change has effect immediately

                            pickRandomBeatmap(archetypeOption);

                            // Forcing corresponding mod if needed
                            // Otherwise mods are set to being free in case they weren't previously

                            if (!forceMods) {
                                setRoomMods(supportedForceMods['NM']);
                                setRoomFreeMods(true);
                                
                                return messageRoomChat('Set free mods');
                            }

                            // First two symbols of the current type, so DT, HR, etc.

                            const forcedMod = archetypeOption.slice(0, 2);

                            if (forcedMod in supportedForceMods) {
                                // Getting mod string and forcing it

                                setRoomMods(supportedForceMods[forcedMod]);
                                setRoomFreeMods(false);

                                messageRoomChat(`Set forced mod to ${forcedMod}`);
                            } else {
                                messageRoomChat(
                                    `There aren\'t any mods that can be forced for type "${archetypeOption}"!`
                                );
                            }
                        }
                        break;
                    case 'skip':
                    case 's':
                        if (playersSkipped.has(uid)) return messageRoomChat('You\'ve already voted!');

                        playersSkipped.add(uid);
                        console.log(playersSkipped);

                        if (playersSkipped.size == 0) {
                            messageRoomChat(
                                `Started beatmap skip voting (1/${players.size - 1} voted, ` +
                                `${Math.ceil(0.5 * (players.size - 1))} required)`
                            );
                        } else {
                            messageRoomChat(
                                `${playersSkipped.size}/${players.size - 1} voted ` +
                                `(${Math.ceil(0.5 * (players.size - 1))} required)`
                            );
                        }

                        if (playersSkipped.size / (players.size - 1) >= 0.5) {
                            // Not clearing playersSkipped because that is done when beatmap is changed

                            changeRoomBeatmap(pickRandomMapHash(archetypeOption));
                            messageRoomChat('Skipped the beatmap');
                        }
                        break;
                    case 'credits':
                    case 'c':
                        messageRoomChat(
                            'This bot is made for autopicking beatmaps ' +
                            'in osu!droid multiplayer based on the chosen map type'
                        );
                        messageRoomChat(
                            'Credits: development of the bot - nikameru, ' +
                            'map library (collections) - unclem'
                        );
                        break;
                    default:
                        messageRoomChat(`No command ${roomCommandName} found! See /help for available commands.`);
                        break;
                }
            });

            socket.on('beatmapChanged', (map) => {
                // Always cleaning previous skip voting results

                playersSkipped.clear();

                messageRoomChat(`Changed beatmap to ${map.artist} - ${map.title} [${map.version}]`);
            });

            socket.on('roomStatusChanged', (status) => {
                console.log(`~ room status changed: ${roomStatus} -> ${status}`);

                // Ensuring that status has *changed* to 0 to avoid looped beatmap changing

                if (status == 0) {
                    // New room status means players have to press ready again
                    // Because of that bot status is changed only at this point

                    setPlayerStatus(1);

                    if (status != roomStatus) {
                        console.log(`~ changing beatmap...`);

                        messageRoomChat('Match has ended. Changing the beatmap...');

                        pickRandomBeatmap(archetypeOption);
                    }
                }

                roomStatus = status;
            });
        });

        connectToRoom(roomInfo.id, connectedToSocketEmitter);
    } else if (subcommandName == 'delete') {
        if (await disconnectFromRoom()) {
            socket = null;

            interaction.reply({ content: 'Disconnected' });
        } else {
            interaction.reply({ content: 'No connection is present!' });
        }
    } else if (subcommandName == 'status') {
        var autolobbyRoom = null;

        const rooms = await getRooms();

        if (!rooms) return interaction.reply({ content: 'Failed to retrieve rooms list!' });

        for (let room of rooms) {
            let names = room.playerNames.split(', ');

            if (names.includes('nika_bot')) {
                autolobbyRoom = room;
                break;
            }
        }

        if (!autolobbyRoom) return interaction.reply({ content: 'No autolobby is present!' });

        roomStatusEmbed.setTitle(`:information_source: | Autolobby status`)
            .setDescription(
                `**Name:** ${autolobbyRoom.name}\n` +
                `**ID:** ${autolobbyRoom.id}\n` +
                `**Locked:** ${autolobbyRoom.isLocked}\n` +
                `**Player limit:** ${autolobbyRoom.maxPlayers}\n` +
                `**Players (${autolobbyRoom.playerCount}):** ${autolobbyRoom.playerNames}\n` +
                `**Status:** ${roomStatuses[autolobbyRoom.status]}`
            )
            .setFooter({ text: 'from nikameru with 💜', iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        interaction.reply({ embeds: [roomStatusEmbed] });
    } else if (subcommandName == 'leaderboard') {
        if (!socket) return interaction.reply('No connection is present!');

        // TODO

        socket.on('liveScoreData', (data) => {
            console.log(data);
        });
    }
}

const config = new SlashCommandBuilder()
    .setName('autolobby')
    .setDescription('Autolobby commands.')
    .addSubcommand(subcommand =>
        subcommand.setName('create')
            .setDescription('Create an osu!droid multiplayer room with automatically refreshed map.')
            .addStringOption(option =>
                option.setName('archetype')
                    .setDescription('Archetype of maps that will be picked (defaults to all).')
                    .setRequired(false)
            )
    )
    .addSubcommand(subcommand =>
        subcommand.setName('delete')
            .setDescription('Delete an osu!droid multiplayer room with automatically refreshed map.')
    )
    .addSubcommand(subcommand =>
        subcommand.setName('status')
            .setDescription('Displays autolobby status.')
    )
    .addSubcommand(subcommand =>
        subcommand.setName('leaderboard')
            .setDescription('Shows autolobby real-time leaderboard, just like osu!droid does.')
    );

module.exports = { run, config };