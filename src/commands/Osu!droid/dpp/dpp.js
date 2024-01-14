const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const { getProfileDPP } = require('../../../utils/droidApi/droidApi.js');

const somethingWentWrongEmbed = new MessageEmbed()
    .setColor('#ff4646')
    .setDescription('❌ **| Something went wrong.**');

const uidNotSpecifiedEmbed = new MessageEmbed()
    .setColor('#ff4646')
    .setDescription(
        '⛔ **| Please bind your droid account via __/droid userbind__ first or specify uid manually!**'
    );

async function run(client, interaction, db) {
    interaction.deferReply();

    const subcommandName = await interaction.options.getSubcommand();
    const droidUsersCollection = await db.collection('droidUsersCollection');
    const droidUser = await droidUsersCollection.findOne({ userId: interaction.user.id });

    var droidId;

    if (droidUser == null && interaction.options.getInteger('uid') == null) {
        return interaction.reply({ embeds: [uidNotSpecifiedEmbed] });
    } else if (droidUser == null || interaction.options.getInteger('uid') != null) {
        droidId = interaction.options.getInteger('uid');
    } else {
        droidId = droidUser.droidId;
    }

    if (subcommandName == 'profile') {
       const dppAmount = await getProfileDPP(droidId);

       interaction.editReply(`${dppAmount}dpp.`);
    }
}

const config = new SlashCommandBuilder()
    .setName('dpp')
    .setDescription('List of osu!droid dpp commands.')
    .addSubcommand(subcommand =>
        subcommand.setName('profile')
            .setDescription('Your dpp profile.')
            .addIntegerOption(option =>
                option.setName('uid')
                    .setDescription('User ID of the account.')
                    .setRequired(false)
            )
    );

module.exports = { run, config };