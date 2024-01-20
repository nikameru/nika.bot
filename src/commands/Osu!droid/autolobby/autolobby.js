const fs = require('node:fs');
const wait = require('node:timers/promises').setTimeout;
const EventEmitter = require('node:events');
const path = require('path');

const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const { 
    createRoom,
    connectToRoom,
    disconnectFromRoom,
    setPlayerStatus,
    roomMatchPlay,
    changeRoomBeatmap,
    messageRoomChat,
    setRoomFreeMods
} = require('../../../utils/droidApi/droidApi.js');

const somethingWentWrongEmbed = new MessageEmbed()
    .setColor('#ff4646')
    .setDescription('❌ **| Something went wrong.**');

const createdRoomEmbed = new MessageEmbed()
    .setColor('#99ec00');

/*const roomInfoEmbed = new MessageEmbed()
    .setColor('#ff80ff');*/

const connectedToSocketEmitter = new EventEmitter();

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

/*function updateRoomInfoEmbed(roomStatus, map, playerAmount) {
    if (roomStatus) roomStatusDescription = `- Room status: ${roomStatuses[roomStatus]} (${playerAmount}/8 players)`;
    if (map) roomMapDescription = `- Map info: ${map.artist} - ${map.title} [${map.version}] by ${map.artist}`;

    roomInfoEmbed.setTitle(`🎮 | Autolobby info`)
        .setDescription(roomStatusDescription + '\n\n' + roomMapDescription)
        .setTimestamp();

    return roomInfoEmbed;
}*/

async function run(client, interaction, db, shouldReconnect = false) {
    const logsChannel = await client.channels.fetch('943228757387407400');
    const subcommandName = await interaction.options.getSubcommand();

    if (subcommandName == 'create') {
        var archetypeOption;

        if (shouldReconnect) {
            archetypeOption = '[NM]';
        } else {
            await interaction.deferReply();

            archetypeOption = await interaction.options.getString('archetype') || '[NM]';

            if (!mapCollections.includes(archetypeOption)) {
                return interaction.editReply({ content: 'Specified map archetype not found!' });
            }
        }

        var roomInfo = await createRoom();
        if (!roomInfo) return interaction.channel.send({ embeds: [somethingWentWrongEmbed] });

        await connectToRoom(roomInfo.id, connectedToSocketEmitter);

        if (shouldReconnect) {
            createdRoomEmbed.setDescription(
                `✅ **| Created __new__ autolobby due to inactivity kick alert with default map type (NM).**`
            );
            
            await interaction.channel.send({ embeds: [createdRoomEmbed] });
        } else {
            createdRoomEmbed.setDescription(
                `✅ **| Created autolobby __nika_bot\'s autolobby__ with ${archetypeOption} map type.**`
            );

            await interaction.editReply({ embeds: [createdRoomEmbed] });
        }

        connectedToSocketEmitter.once('socketConnection', async (socket) => {
            // Free mods setting is true by default

            setRoomFreeMods(true);

            // Force setting initial map

            const initialMap = await pickRandomMapHash(archetypeOption);
            await changeRoomBeatmap(initialMap);

            await wait(2000);

            // List of players in the room - { uid: [username, status] }

            const players = new Map();

            // For handling /skip command voting

            const playersSkipped = new Set();

            // Self-bot is ready by default

            players.set('454815', { username: 'nika_bot', status: 1 });
            setPlayerStatus(1);

            var roomStatus = 0;

            // Event listeners

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
                logsChannel.send(
                    `~ chat: ${players.get(uid) ? players.get(uid).username : 'SYSTEM'} (uid: ${uid}) - ${message}`
                );

                // Not allowing the server to kick the bot in case nobody plays in the room

                if (!uid && message.includes('host will be kicked for inactivity')) {
                    return run(client, interaction, null, true);
                }

                // Command handling
    
                if (!message.startsWith('/')) return;

                const roomCommandArgs = message.slice(1).split(' ');
                const roomCommandName = roomCommandArgs.shift();

                console.log(`~ command: ${roomCommandName} with args "${roomCommandArgs.join(' ,')}"`);

                switch (roomCommandName) {
                    case 'help':
                    case 'h':
                        messageRoomChat('/help - Sends a list of bot\'s commands (alias: /h)');
                        messageRoomChat('/type [type] - Change picked beatmaps type (alias: /t)');
                        messageRoomChat('/skip - Start a vote for skipping current beatmap (alias: /s)');
                        messageRoomChat('/credits - Information about the bot (alias: /c)');
                        break;
                    case 'type':
                    case 't':
                        let type = roomCommandArgs.length > 1 ? roomCommandArgs.join(' ') : roomCommandArgs[0];

                        if (!mapCollections.includes(type)) {
                            messageRoomChat(`No type ${type} found! Available types: ${mapCollections.join(', ')}`);
                        } else {
                            archetypeOption = type;
                            messageRoomChat(`Changed picked maps type to ${type}`);
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
                            'in osu!droid multiplayer based on the chosen type'
                        );
                        messageRoomChat('Credits: development of the bot - nikameru, map library (collections) - unclem');
                        break;
                    default:
                        messageRoomChat(`No command ${roomCommandName} found! See /help for available commands.`);
                        break;
                }
            });

            socket.on('beatmapChanged', (map) => {
                console.log(map);
            
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

                        const randomMapHash = pickRandomMapHash(archetypeOption);
                        changeRoomBeatmap(randomMapHash);
                    }
                }

                roomStatus = status;
            });
        });
    } else if (subcommandName == 'delete') {
        if (await disconnectFromRoom()) {
            interaction.reply({ content: 'Disconnected' });
        } else {
            interaction.reply({ content: 'No connection is present!' });
        }
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
    );

module.exports = { run, config };