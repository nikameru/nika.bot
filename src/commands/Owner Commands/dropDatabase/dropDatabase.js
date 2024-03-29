const { MessageEmbed } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');

const accessDeniedEmbed = new MessageEmbed()
    .setColor('#ff4646')
    .setDescription('⛔ **| You don\'t have permission to use this command.**');

module.exports = {
    async run(client, interaction, db) {
        if (interaction.user.id != '600113325178880002') {
            interaction.reply({ embeds: [accessDeniedEmbed] });
        } else {
            await db.dropDatabase();

            interaction.reply('✅ **| Database dropped successfully.**');
        }
    },
    config: new SlashCommandBuilder()
        .setName('dropdb')
        .setDescription('Drops database.')
};