const { MessageEmbed } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { getRecentPlays } = require('../../../utils/droidApi/droidApi.js');
const danCourses = require('../../../data/danCourses.json');

const uidNotFoundEmbed = new MessageEmbed()
    .setColor('#ff4646')
    .setDescription(
        '⛔ **| Please bind your droid account via __/droid userbind__ first!**'
    );

const wrongMapEmbed = new MessageEmbed()
    .setColor('#ff4646')
    .setDescription(
        '⛔ **| Your recent play is not a picked Dan map!**'
    );

const conditionNotMetEmbed = new MessageEmbed()
    .setColor('#ff4646')
    .setDescription(
        '⛔ **| Your accuracy is too low (or you\'ve used some unallowed mods)!**'
    );

const danClaimedEmbed = new MessageEmbed()
    .setColor('#ecec00')
    .setTitle('📖 | Dan system')

async function run(client, interaction, db) {
    const subcommandName = await interaction.options.getSubcommand();
    const danOption = await interaction.options.getString('name');
    const desiredDan = danCourses.courses[danOption];
    const droidUsersCollection = await db.collection('droidUsersCollection');
    const droidUser = await droidUsersCollection.findOne({ userId: interaction.user.id });
 
    var droidId;

    if (droidUser != null) {
        droidId = droidUser.droidId;
    } else {
        return interaction.reply({ embeds: [uidNotFoundEmbed] });
    }

    const recentPlay = await getRecentPlays(droidId, 1);

    if (recentPlay[0].title != desiredDan.title) {
        return interaction.reply({ embeds: [wrongMapEmbed] });
    } else if (parseFloat(recentPlay[0].accuracy).toFixed(0) < desiredDan.condition || recentPlay[0].mods != ' ') {
        return interaction.reply({ embeds: [conditionNotMetEmbed] });
    } else {
        await interaction.member.roles.add(desiredDan.rewardRoleId);

        danClaimedEmbed.setDescription(`✅ **| Congratulations!** You've passed __${desiredDan.name}__!`)
            .setFooter({ text: 'from nikameru with 💜', iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        interaction.reply({ embeds: [danClaimedEmbed] });
    }
}

const config = new SlashCommandBuilder()
    .setName('dan')
    .setDescription('Dan system commands.')
    .addSubcommand(subcommand =>
        subcommand.setName('claim')
            .setDescription('Claim completed Dan role!')
            .addStringOption(option =>
                option.setName('name')
                    .setDescription('Name of the Dan.')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Aim Dan', value: 'aim' }
                    )
            )
    );

module.exports = { run, config };