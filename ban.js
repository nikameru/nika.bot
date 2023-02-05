const { MessageEmbed } = require('discord.js');
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    async run(client, interaction) {
    },
    /*config: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bans a user (or a bot) from the server.')
        .addMentionableOption(option => {
            option.setName('user')
                .setDescription('Mention somebody who you want to ban.')
                .setRequired(true);
        }).addStringOption(option => {
            option.setName('reason')
                .setDescription('A reason for a ban.')
                .setRequired(true);
        }).addIntegerOption(option => {
            option.setName('days')
                .setDescription('Number of ban days.')
        })*/
};