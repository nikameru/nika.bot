const fs = require('node:fs');
const path = require('path');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { Collection } = require('discord.js');

const subcommandsFolder = fs.readdirSync(path.resolve(__dirname, './subcommands'));

if (subcommandsFolder.length > 0) {
    var subcommands = new Collection();

    for (let file of subcommandsFolder) {
        if (!file.endsWith('.js')) continue;

        const subcommand = require(`./subcommands/${file}`);
        subcommands.set(subcommand.config.name, subcommand);

        console.log(file);
    }
}

// Autolobby properties object

const autolobby = {
    socket: null,
    archetype: null,
    beatmap: null,
    status: null,
    players: null,
    playersSkipped: null
};

async function run(client, interaction, db) {
    const subcommandName = await interaction.options.getSubcommand();
    const subcommand = subcommands.get(subcommandName);

    if (!subcommand) return;

    try {
        await subcommand.run(client, interaction, db, autolobby);
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'Something went wrong!', ephemeral: true });
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
            .setDescription('Shows real-time match leaderboard, just like osu!droid does.')
    );

module.exports = { run, config };