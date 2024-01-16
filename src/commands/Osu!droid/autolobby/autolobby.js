const fs = require('node:fs');
const wait = require('node:timers/promises').setTimeout;
const EventEmitter = require('node:events');
const path = require('path');

const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed, MessageAttachment, Collection } = require('discord.js');
const { 
    createRoom,
    connectToRoom,
    disconnectFromRoom,
    setPlayerStatus,
    roomMatchPlay,
    changeRoomBeatmap,
    messageRoomChat
} = require('../../../utils/droidApi/droidApi.js');

const somethingWentWrongEmbed = new MessageEmbed()
    .setColor('#ff4646')
    .setDescription('❌ **| Something went wrong.**');

const createdRoomEmbed = new MessageEmbed()
    .setColor('#99ec00');

const roomInfoEmbed = new MessageEmbed()
    .setColor('#ff80ff');

const connectedToSocketEmitter = new EventEmitter();

const playerStatuses = ['Not ready', 'Ready', 'Missing beatmap', 'Playing'];
const roomStatuses = ['Idle', 'Changing beatmap', 'Playing'];

//var roomStatusDescription = '';
//var roomMapDescription = '';
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

console.log(mapCollections);

function isEveryoneReady(players) {
    for (let status of players.values()) {
        if (status != 1) {
            return false;
        }
    }

    return true;
}

function pickRandomMapHash(archetype) {
    const sortedMaps = require(`../../../data/maps/${archetype}.json`);

    return sortedMaps.hashes[Math.floor(Math.random() * (sortedMaps.size - 1))];
}

function updateRoomInfoEmbed(roomStatus, map, playerAmount) {
    if (roomStatus) roomStatusDescription = `- Room status: ${roomStatuses[roomStatus]} (${playerAmount}/8 players)`;
    if (map) roomMapDescription = `- Map info: ${map.artist} - ${map.title} [${map.version}] by ${map.artist}`;

    roomInfoEmbed.setTitle(`🎮 | Autolobby info`)
        .setDescription(roomStatusDescription + '\n\n' + roomMapDescription)
        .setTimestamp();

    return roomInfoEmbed;
}

async function run(client, interaction) {
    const subcommandName = await interaction.options.getSubcommand();

    if (subcommandName == 'create') {
        await interaction.deferReply();

        const archetypeOption = await interaction.options.getString('archetype') || 'Jumps [Ultimate Pack]';
        if (!mapCollections.includes(archetypeOption)) { 
            return interaction.editReply({ content: 'Specified map archetype not found!' });
        }

        var roomInfo = await createRoom();
        if (!roomInfo) return interaction.editReply({ embeds: [somethingWentWrongEmbed] });

        await connectToRoom(roomInfo.id, connectedToSocketEmitter);

        connectedToSocketEmitter.once('socketConnection', async (socket) => {
            roomInfoEmbed.setFooter({ text: 'nika.bot', iconURL: client.user.displayAvatarURL() });

            createdRoomEmbed.setDescription(`✅ **| Created autolobby __nika.bot\'s autolobby__ with ${archetypeOption} maps.**`);
            await interaction.editReply({ embeds: [createdRoomEmbed] });

            // Force setting initial map
            const initialMap = await pickRandomMapHash(archetypeOption);
            await changeRoomBeatmap(initialMap);

            await wait(2000);

            // List of player statuses - uid : status (ready or not)
            const playerStatuses = new Map();
            // For handling /skip command voting
            const playersSkipped = new Set();

            // Self-bot is ready by default
            playerStatuses.set('454815', 1);
            setPlayerStatus(1);

            var roomStatus = 0;

            socket.on('playerJoined', (data) => {
                console.log(`~ player joined: ${data.username} (uid: ${data.uid})`);

                playerStatuses.set(data.uid, data.status);
            });

            socket.on('playerLeft', (uid) => {
                console.log(`~ player left (uid: ${uid})`);

                playerStatuses.delete(uid);
            });

            socket.on('playerStatusChanged', (uid, status) => {
                console.log(`~ player status changed (uid: ${uid}, status: ${status})`);

                playerStatuses.set(uid, status);

                /*interaction.channel.send({
                    content: `Statuses: ${JSON.stringify(playerStatuses, (k, v) => (v instanceof Map ? [...v] : v))}`
                });*/

                // If room has more than 2 players (including bot) and everyone is ready, start match
                if (playerStatuses.size >= 2 && isEveryoneReady(playerStatuses)) {
                    console.log('~ everyone is ready - starting match in 5s');
                    messageRoomChat('Starting match in 5 seconds...');

                    (async () => {
                        await wait(5000);
                        await roomMatchPlay();
                    })();
                }
            });

            socket.on('chatMessage', (uid, message) => {
                interaction.channel.send(`~ chat: ${uid} - ${message}`);

                if (!message.startsWith('/')) return;

                const roomCommandArgs = message.slice(1).split(' ');
                const roomCommandName = roomCommandArgs.shift();

                console.log(`~ command: ${roomCommandName} with args "${roomCommandArgs.join(' ,')}"`);

                switch (roomCommandName) {
                    case 'help':
                        messageRoomChat('/help - Sends a list of bot\'s commands');
                        messageRoomChat('/skip - Skip current beatmap and pick another one');
                        break;
                    case 'type' || 'mt':
                        if (1) {

                        } else {
                            messageRoomChat();
                        }
                    case 'skip':
                        if (playersSkipped.has(uid)) return messageRoomChat('You\'ve already voted!');

                        playersSkipped.add(uid);
                        console.log(playersSkipped);

                        if (playersSkipped.size == 0) {
                            messageRoomChat(
                                `Started beatmap skip voting (1/${playerStatuses.size - 1} voted, ` +
                                `${Math.ceil(0.5 * (playerStatuses.size - 1))} required)`
                            );
                        } else {
                            messageRoomChat(
                                `${playersSkipped.size}/${playerStatuses.size - 1} voted ` +
                                `(${Math.ceil(0.5 * (playerStatuses.size - 1))} required)`
                            );
                        }

                        if (playersSkipped.size / (playerStatuses.size - 1) > 0.5) {
                            //playersSkipped.clear();

                            changeRoomBeatmap(pickRandomMapHash(archetypeOption));
                            messageRoomChat('Skipped the beatmap');
                        }
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

                //setPlayerStatus(1);
            });

            socket.on('roomStatusChanged', (status) => {
                console.log(`~ room status changed: ${roomStatus} -> ${status}`);
                //interaction.editReply({ embeds: [updateRoomInfoEmbed(status, null, playerStatuses.size)] });

                // Ensuring that status has *changed* to 0 to avoid looped beatmap changing
                if (status == 0) {
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