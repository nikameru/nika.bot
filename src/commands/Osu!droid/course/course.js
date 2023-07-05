const { MessageEmbed } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { getRecentPlays } = require('../../../utils/droidApi/droidApi.js');

const uidNotFoundEmbed = new MessageEmbed()
    .setColor('#ff4646')
    .setDescription(
        '⛔ **| Please bind your droid account via __/droid userbind__ first!**'
    );

const wrongMapEmbed = new MessageEmbed()
    .setColor('#ff4646')
    .setDescription(
        '⛔ **| Your recent play is not a picked Skill Course map!**'
    );

const conditionNotMetEmbed = new MessageEmbed()
    .setColor('#ff4646')
    .setDescription(
        '⛔ **| Your accuracy is too low (or you\'ve used some unallowed mods)!**'
    );

const courseClaimedEmbed = new MessageEmbed()
    .setColor('#ecec00')
    .setTitle('📖 | Skill Course system')

async function run(client, interaction, db) {
    const courses = require('../../../data/skillCourses.json');
    const subcommandName = await interaction.options.getSubcommand();
    const courseOption = await interaction.options.getString('name');
    const desiredCourse = courses.courses[courseOption];
    const droidUsersCollection = await db.collection('droidUsersCollection');
    const droidUser = await droidUsersCollection.findOne({ userId: interaction.user.id });
 
    var droidId;

    if (droidUser != null) {
        droidId = droidUser.droidId;
    } else {
        return interaction.reply({ embeds: [uidNotFoundEmbed] });
    }

    try {
        const recentPlay = await getRecentPlays(droidId, 1);
    } catch {
        return interaction.reply({ content: 'Error.', ephemeral: true });
    }

    if (recentPlay[0].title != desiredCourse.title) {
        return interaction.reply({ embeds: [wrongMapEmbed] });
    } else if (parseFloat(recentPlay[0].accuracy).toFixed(0) < desiredCourse.condition || recentPlay[0].mods != ' ') {
        return interaction.reply({ embeds: [conditionNotMetEmbed] });
    } else {
        await interaction.member.roles.add(desiredCourse.rewardRoleId);

        courseClaimedEmbed.setDescription(`✅ **| Congratulations!** You've passed __${desiredCourse.name}__!`)
            .setFooter({ text: 'from nikameru with 💜', iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        interaction.reply({ embeds: [courseClaimedEmbed] });
    }
}

const config = new SlashCommandBuilder()
    .setName('course')
    .setDescription('Skill Course system commands.')
    .addSubcommand(subcommand =>
        subcommand.setName('claim')
            .setDescription('Claim completed Skill Course role!')
            .addStringOption(option =>
                option.setName('name')
                    .setDescription('Name of the Course.')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Aim Death Skill Course', value: 'aim' }
                    )
            )
    );

module.exports = { run, config };