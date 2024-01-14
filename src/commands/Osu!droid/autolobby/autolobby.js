const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed, MessageAttachment } = require('discord.js');
const { 
    createRoom,
    connectToRoom,
    disconnectFromRoom,
    setPlayerStatus,
    roomMatchPlay
} = require('../../../utils/droidApi/droidApi.js');
const wait = require('node:timers/promises').setTimeout;

function isEveryoneReady(players) {
    for (let status of players.values()) {
        if (status != 1) {
            return false;
        }
    }

    return true;
}

async function run(client, interaction) {
    const subcommandName = await interaction.options.getSubcommand();

    if (subcommandName == 'create') {
        await interaction.deferReply();

        const archetypeOption = await interaction.options.getString('archetype') || 'all';

        var roomInfo = await createRoom();

        if (roomInfo) {
            socket = await connectToRoom(roomInfo.id);

            await interaction.editReply({ content: `Lobby unclem's room, with ${archetypeOption} maps (player limit: 8); roomId: ${roomInfo.id}, socket ${socket.id}` });

            // List of player statuses - uid : status (ready or not)
            const playerStatuses = new Map();

            // Self-bot is ready by default
            playerStatuses.set('199195', 0);
            await setPlayerStatus(1);

            socket.on('playerJoined', (data) => {
                console.log(`~ player joined: ${data.username} (uid: ${data.uid})`);

                playerStatuses.set(data.uid, data.status);
            });

            socket.on('playerLeft', (data) => {
                console.log(`~ player left (uid: ${data.uid})`);

                playerStatuses.delete(data.toString());
            });

            socket.on('playerStatusChanged', async (uid, status) => {
                console.log(`~ player status changed (uid: ${uid}, status: ${status})`);

                await interaction.channel.send({
                    content: `Statuses: ${JSON.stringify(playerStatuses, (k, v) => (v instanceof Map ? [...v] : v))}`
                });

                playerStatuses.set(uid, status);

                // If room has more than 2 players and everyone is ready, start match
                if (playerStatuses.size >= 2 && isEveryoneReady(playerStatuses)) {
                    console.log('~ everyone is ready - starting match in 5s');

                    await wait(5000);
                    await roomMatchPlay();
                }
            });

            socket.on('beatmapChanged', (data) => {
                console.log(data.toString());
                interaction.editReply({ content: `beatmap changed: ${data.toString()}` });
            });

            socket.on('roomStatusChanged', (data) => {
                console.log(data);
            });
        } else {
            await interaction.editReply({ content: `Something went wrong!` });   
        }
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
                    .addChoices(
                        { name: 'All', value: 'all' },
                        { name: 'Jumps', value: 'jumps' },
                        { name: 'Streams', value: 'streams' }
                    )
            )
    )
    .addSubcommand(subcommand =>
        subcommand.setName('delete')
            .setDescription('Delete an osu!droid multiplayer room with automatically refreshed map.')
    );

module.exports = { run, config };